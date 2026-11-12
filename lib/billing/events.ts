import { createElement } from 'react';
import { PaymentFailedEmail } from '@/emails/payment-failed';
import { getRepo, type Repo } from '@/lib/db';
import type { PlanId, Profile, ReferralStatus, Subscription } from '@/lib/db/types';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { getPlan, REFERRAL_COMMISSION_RATE } from '@/lib/plans';
import { formatEuros } from '@/lib/utils';
import {
  ACTIVE_STATUSES,
  type BillingEvent,
  type InvoicePaid,
  type PaymentFailed,
  type PaymentRefunded,
  type SubscriptionChanged,
} from './types';

/**
 * Traitement des événements de paiement normalisés, quel que soit le prestataire.
 * Idempotent : chaque opération peut être rejouée sans effet de bord (upsert par identifiant,
 * commission unique par facture), et l'événement n'est marqué « traité » qu'à la fin
 * pour qu'un échec soit réessayé par le prestataire.
 */

export interface HandleResult {
  status: 'ok' | 'duplicate' | 'ignored' | 'unknown_user';
  userId?: string | null;
  plan?: PlanId;
  commissionCents?: number;
  /** Remboursement : part de commission annulée (cumulée) et commission restante. */
  canceledCents?: number;
  remainingCents?: number;
  /** Échec de paiement : l'abonné a-t-il été prévenu par e-mail ? */
  notified?: boolean;
}

async function resolveProfile(repo: Repo, userId: string | null, customerId: string | null): Promise<Profile | null> {
  if (userId) {
    const profile = await repo.getProfile(userId);
    if (profile) return profile;
  }
  if (customerId) return repo.getProfileByStripeCustomer(customerId);
  return null;
}

function referralStatusFor(status: string): ReferralStatus {
  if (status === 'trialing') return 'essai';
  if (ACTIVE_STATUSES.includes(status)) return 'abonne';
  return 'resilie';
}

/** Le meilleur plan parmi les abonnements actifs de l'utilisateur. */
function bestPlan(subscriptions: Subscription[]): PlanId {
  const active = subscriptions.filter((s) => ACTIVE_STATUSES.includes(s.status));
  if (active.some((s) => s.plan === 'proplus')) return 'proplus';
  if (active.some((s) => s.plan === 'pro')) return 'pro';
  return 'free';
}

async function onSubscription(repo: Repo, event: SubscriptionChanged): Promise<HandleResult> {
  const profile = await resolveProfile(repo, event.userId, event.customerId);
  if (!profile) return { status: 'unknown_user', userId: event.userId };

  const existing = await repo.getSubscription(event.subscriptionId);
  const plan = event.plan ?? existing?.plan ?? 'pro';
  await repo.upsertSubscription({
    id: event.subscriptionId,
    user_id: profile.id,
    provider: event.provider,
    customer_id: event.customerId,
    status: event.status,
    plan,
    billing_interval: event.interval ?? existing?.billing_interval ?? null,
    price_id: event.priceId ?? existing?.price_id ?? null,
    current_period_end: event.currentPeriodEnd,
    trial_end: event.trialEnd,
    cancel_at_period_end: event.cancelAtPeriodEnd,
    updated_at: new Date().toISOString(),
  });

  const all = (await repo.listSubscriptions()).filter((s) => s.user_id === profile.id);
  const newPlan = bestPlan(all);
  await repo.updateProfile(profile.id, {
    plan: newPlan,
    ...(event.customerId && event.provider === 'stripe' && !profile.stripe_customer_id ? { stripe_customer_id: event.customerId } : {}),
    ...(event.status === 'trialing' ? { trial_used: true } : {}),
  });

  const referral = await repo.getReferralByReferred(profile.id);
  if (referral) await repo.updateReferral(referral.id, { status: referralStatusFor(newPlan === 'free' ? 'canceled' : event.status) });

  return { status: 'ok', userId: profile.id, plan: newPlan };
}

/** 30 % récurrents (ou le taux du formateur) sur chaque facture payée par un filleul. */
async function onInvoicePaid(repo: Repo, event: InvoicePaid): Promise<HandleResult> {
  const profile = await resolveProfile(repo, event.userId, event.customerId);
  if (!profile) return { status: 'unknown_user', userId: event.userId };
  if (event.amountCents <= 0) return { status: 'ok', userId: profile.id, commissionCents: 0 };

  const referral = await repo.getReferralByReferred(profile.id);
  if (!referral) return { status: 'ok', userId: profile.id, commissionCents: 0 };

  let rate = REFERRAL_COMMISSION_RATE;
  if (referral.coach_id) {
    const coach = await repo.getCoachById(referral.coach_id);
    if (coach) rate = coach.commission_rate;
  }
  const amount = Math.round(event.amountCents * rate);
  const added = await repo.addCommission({
    referral_id: referral.id,
    referrer_id: referral.referrer_id,
    invoice_id: event.invoiceId,
    amount_cents: amount,
    month: event.paidAt.slice(0, 7),
  });
  if (added) await repo.updateReferral(referral.id, { status: 'abonne' });
  return { status: 'ok', userId: profile.id, commissionCents: added ? amount : 0 };
}

/** Remboursement : la commission de la facture est annulée au prorata du montant remboursé (cumulé). */
async function onRefund(repo: Repo, event: PaymentRefunded): Promise<HandleResult> {
  if (!event.invoiceId || event.amountCents <= 0) return { status: 'ok', canceledCents: 0 };
  const result = await repo.refundCommission(event.invoiceId, event.refundedCents / event.amountCents);
  return { status: 'ok', canceledCents: result?.canceledCents ?? 0, remainingCents: result?.remainingCents };
}

/**
 * Échec de prélèvement : l'accès reste ouvert tant que Stripe réessaie (statut « past_due »), et l'abonné reçoit un
 * e-mail avec le lien pour changer de carte. Une seule fois par tentative (clé d'idempotence). L'e-mail n'est qu'une
 * notification : son échec n'empêche pas de traiter l'événement.
 */
async function onPaymentFailed(repo: Repo, event: PaymentFailed): Promise<HandleResult> {
  const profile = await resolveProfile(repo, event.userId, event.customerId);
  if (!profile) return { status: 'unknown_user', userId: event.userId };
  const subscription = event.subscriptionId ? await repo.getSubscription(event.subscriptionId) : null;
  const planName = getPlan(subscription?.plan ?? profile.plan).name;
  try {
    await sendEmail({
      to: profile.email,
      subject: `Ton paiement de ${formatEuros(event.amountDueCents)} n’est pas passé`,
      react: createElement(PaymentFailedEmail, {
        planName,
        amountCents: event.amountDueCents,
        nextAttemptAt: event.nextAttemptAt,
        siteUrl: env.siteUrl,
      }),
      idempotencyKey: `paiement-echoue-${event.invoiceId}-${event.attemptCount}`,
    });
    return { status: 'ok', userId: profile.id, notified: true };
  } catch (error) {
    console.error('[paiement échoué] e-mail', profile.id, error);
    return { status: 'ok', userId: profile.id, notified: false };
  }
}

export async function handleBillingEvent(event: BillingEvent, repo: Repo = getRepo()): Promise<HandleResult> {
  if (event.kind === 'ignored') return { status: 'ignored' };

  let result: HandleResult;
  switch (event.kind) {
    case 'subscription':
      result = await onSubscription(repo, event);
      break;
    case 'invoice_paid':
      result = await onInvoicePaid(repo, event);
      break;
    case 'refund':
      result = await onRefund(repo, event);
      break;
    case 'payment_failed': {
      // Le seul effet est un e-mail : l'événement est marqué d'abord, pour qu'un webhook rejoué (Stripe réessaie
      // pendant plusieurs jours) ne prévienne jamais deux fois.
      if (!(await repo.markBillingEvent(event.eventId, event.kind))) return { status: 'duplicate' };
      return onPaymentFailed(repo, event);
    }
    case 'checkout_completed': {
      const profile = await resolveProfile(repo, event.userId, event.customerId);
      if (profile && event.customerId && event.provider === 'stripe' && !profile.stripe_customer_id) {
        await repo.updateProfile(profile.id, { stripe_customer_id: event.customerId });
      }
      result = { status: profile ? 'ok' : 'unknown_user', userId: profile?.id ?? event.userId };
      break;
    }
  }

  const fresh = await repo.markBillingEvent(event.eventId, event.kind);
  return fresh ? result : { ...result, status: result.status === 'ok' ? 'duplicate' : result.status };
}
