import Stripe from 'stripe';
import { getRepo } from '@/lib/db';
import type { BillingInterval, PlanId, Profile } from '@/lib/db/types';
import { env } from '@/lib/env';
import { handleBillingEvent } from './events';
import { missingPriceIds, planFromPriceId, priceIdFor } from './prices';
import { BillingUnavailableError, type BillingEvent, type BillingProvider, type SubscriptionChanged } from './types';

/**
 * Implémentation Stripe : Checkout, portail client, essai sans carte, webhooks.
 * Tout le code Stripe vit ici ; le reste de l'appli ne connaît que BillingProvider.
 */

let stripeClient: Stripe | null = null;
let testClient: Stripe | null = null;
export function getStripe(): Stripe {
  if (testClient) return testClient;
  if (!env.stripeSecretKey) throw new BillingUnavailableError();
  stripeClient ??= new Stripe(env.stripeSecretKey, { appInfo: { name: 'tracktout' } });
  return stripeClient;
}

/** Tests : un client Stripe qui parle à un faux serveur local (même SDK, mêmes requêtes HTTP). */
export function setStripeForTests(client: Stripe | null) {
  testClient = client;
}

// Lecture défensive : les champs ont changé de place selon les versions de l'API Stripe.
type Loose = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? String((v as Loose).id) : null);
const iso = (seconds: unknown): string | null => (typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000).toISOString() : null);

export function normalizeStripeSubscription(sub: Loose, eventId: string): SubscriptionChanged {
  const items = ((sub.items as Loose | undefined)?.data as Loose[] | undefined) ?? [];
  const firstItem = items[0] ?? {};
  const price = (firstItem.price as Loose | undefined) ?? {};
  const priceId = str(price.id) ?? str(price);
  const mapped = planFromPriceId(priceId);
  const metadata = (sub.metadata as Record<string, string> | undefined) ?? {};
  const periodEnd = (firstItem.current_period_end as number | undefined) ?? (sub.current_period_end as number | undefined);
  return {
    kind: 'subscription',
    eventId,
    provider: 'stripe',
    subscriptionId: String(sub.id),
    customerId: str(sub.customer),
    userId: metadata.user_id ?? null,
    status: String(sub.status),
    plan: mapped?.plan ?? null,
    interval: mapped?.interval ?? ((price.recurring as Loose | undefined)?.interval as BillingInterval | undefined) ?? null,
    priceId,
    currentPeriodEnd: iso(periodEnd),
    trialEnd: iso(sub.trial_end),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
}

/** Abonnement et métadonnées d'une facture (format actuel : invoice.parent.subscription_details). */
function invoiceParent(object: Loose): { details: Loose; metadata: Record<string, string> } {
  const parent = (object.parent as Loose | undefined) ?? {};
  const details = (parent.subscription_details as Loose | undefined) ?? {};
  return { details, metadata: (details.metadata as Record<string, string> | undefined) ?? {} };
}

/** Convertit un événement Stripe en événement normalisé. Pur : testable sans réseau. */
export function normalizeStripeEvent(event: { id: string; type: string; data: { object: unknown } }): BillingEvent {
  const object = event.data.object as Loose;
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return normalizeStripeSubscription(object, event.id);

    case 'invoice.paid': {
      const { metadata, details } = invoiceParent(object);
      const taxes = ((object.total_taxes as Array<{ amount?: number }> | undefined) ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
      const legacyTax = typeof object.tax === 'number' ? object.tax : 0;
      const amountPaid = Number(object.amount_paid ?? 0);
      const paidAt = (object.status_transitions as Loose | undefined)?.paid_at ?? object.created;
      return {
        kind: 'invoice_paid',
        eventId: event.id,
        provider: 'stripe',
        invoiceId: String(object.id),
        customerId: str(object.customer),
        subscriptionId: str(details.subscription) ?? str(object.subscription),
        userId: metadata.user_id ?? null,
        amountCents: Math.max(0, amountPaid - (taxes || legacyTax)),
        paidAt: iso(paidAt) ?? new Date().toISOString(),
      };
    }

    case 'invoice.payment_failed': {
      const { metadata, details } = invoiceParent(object);
      return {
        kind: 'payment_failed',
        eventId: event.id,
        provider: 'stripe',
        invoiceId: String(object.id),
        customerId: str(object.customer),
        subscriptionId: str(details.subscription) ?? str(object.subscription),
        userId: metadata.user_id ?? null,
        amountDueCents: Number(object.amount_due ?? 0),
        attemptCount: Number(object.attempt_count ?? 1),
        nextAttemptAt: iso(object.next_payment_attempt),
      };
    }

    // Le remboursement porte sur un paiement (charge) ; depuis 2025 la charge ne mentionne plus sa facture, retrouvée
    // ensuite par l'API des paiements de facture (enrichStripeEvent).
    case 'charge.refunded':
      return {
        kind: 'refund',
        eventId: event.id,
        provider: 'stripe',
        invoiceId: str(object.invoice),
        paymentIntentId: str(object.payment_intent),
        customerId: str(object.customer),
        amountCents: Number(object.amount ?? 0),
        refundedCents: Number(object.amount_refunded ?? 0),
      };

    case 'checkout.session.completed':
      return {
        kind: 'checkout_completed',
        eventId: event.id,
        provider: 'stripe',
        customerId: str(object.customer),
        userId: (object.client_reference_id as string | null) ?? null,
        subscriptionId: str(object.subscription),
      };

    default:
      return { kind: 'ignored', eventId: event.id, type: event.type };
  }
}

/** Vérifie la signature du webhook puis normalise. */
export function parseStripeWebhook(rawBody: string, signature: string | null): BillingEvent {
  if (!env.stripeWebhookSecret) throw new BillingUnavailableError('STRIPE_WEBHOOK_SECRET manquant : webhook refusé.');
  if (!signature) throw new Error('En-tête stripe-signature manquant.');
  const event = getStripe().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  return normalizeStripeEvent(event as unknown as { id: string; type: string; data: { object: unknown } });
}

/**
 * Complète un événement avec l'état actuel chez Stripe :
 * - abonnement : relu, car les webhooks peuvent arriver dans le désordre et l'état le plus récent fait foi ;
 * - remboursement : la facture du paiement, via GET /v1/invoice_payments?payment[type]=payment_intent.
 * Une erreur réseau sur un remboursement est levée (le webhook répond 500 et Stripe réessaie) : sans la facture, la
 * commission ne pourrait pas être annulée.
 */
export async function enrichStripeEvent(event: BillingEvent): Promise<BillingEvent> {
  if (event.kind === 'refund' && event.provider === 'stripe' && !event.invoiceId && event.paymentIntentId) {
    const payments = await getStripe().invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: event.paymentIntentId },
      limit: 1,
    });
    return { ...event, invoiceId: str(payments.data[0]?.invoice) };
  }
  if (event.kind !== 'subscription' || event.provider !== 'stripe') return event;
  try {
    const sub = await getStripe().subscriptions.retrieve(event.subscriptionId);
    const fresh = normalizeStripeSubscription(sub as unknown as Loose, event.eventId);
    return { ...fresh, userId: event.userId ?? fresh.userId };
  } catch {
    return event;
  }
}

/** Portail client : configuration créée par « npm run stripe:setup » (changement de plan, résiliation…) si fournie. */
function portalBase(customer: string) {
  return {
    customer,
    locale: 'fr' as const,
    return_url: `${env.siteUrl}/app/compte`,
    ...(env.stripePortalConfiguration ? { configuration: env.stripePortalConfiguration } : {}),
  };
}

async function ensureCustomer(profile: Profile): Promise<string> {
  if (profile.stripe_customer_id) return profile.stripe_customer_id;
  const customer = await getStripe().customers.create({
    email: profile.email,
    name: profile.first_name ?? undefined,
    preferred_locales: ['fr'],
    metadata: { user_id: profile.id },
  });
  await getRepo().updateProfile(profile.id, { stripe_customer_id: customer.id });
  return customer.id;
}

/**
 * Session Checkout d'un nouvel abonnement. `allow_promotion_codes` affiche le champ « code promotionnel » de la page de
 * paiement Stripe : les codes se créent dans le tableau de bord Stripe (coupon + code promotionnel), sans code ici.
 */
export function checkoutSessionParams(input: { customer: string; userId: string; price: string; siteUrl: string }): Stripe.Checkout.SessionCreateParams {
  return {
    mode: 'subscription',
    customer: input.customer,
    client_reference_id: input.userId,
    line_items: [{ price: input.price, quantity: 1 }],
    subscription_data: { metadata: { user_id: input.userId } },
    allow_promotion_codes: true,
    locale: 'fr',
    success_url: `${input.siteUrl}/app/compte?paiement=ok`,
    cancel_url: `${input.siteUrl}/app/passer-pro?paiement=annule`,
  };
}

export class StripeBilling implements BillingProvider {
  readonly name = 'stripe' as const;

  async createCheckout({ profile, plan, interval }: { profile: Profile; plan: Exclude<PlanId, 'free'>; interval: BillingInterval }) {
    const price = priceIdFor(plan, interval);
    if (!price) {
      throw new BillingUnavailableError(`Prix Stripe manquant pour ce plan (${missingPriceIds().join(', ')}).`);
    }
    // Déjà abonné (y compris pendant l'essai formateur) : changement de plan dans le portail, directement sur l'écran
    // de confirmation du nouveau prix (prorata calculé et affiché par Stripe), pas de second abonnement.
    const active = await getRepo().getActiveSubscription(profile.id);
    if (active?.provider === 'stripe') return this.changePlan({ profile, subscriptionId: active.id, price });

    const customer = await ensureCustomer(profile);
    const session = await getStripe().checkout.sessions.create(checkoutSessionParams({ customer, userId: profile.id, price, siteUrl: env.siteUrl }));
    if (!session.url) throw new Error('Stripe n’a pas renvoyé d’URL de paiement.');
    return session.url;
  }

  async createPortal({ profile, flow }: { profile: Profile; flow?: 'payment_method_update' }) {
    const customer = await ensureCustomer(profile);
    const session = await getStripe().billingPortal.sessions.create({
      ...portalBase(customer),
      ...(flow ? { flow_data: { type: flow } } : {}),
    });
    return session.url;
  }

  private async changePlan({ profile, subscriptionId, price }: { profile: Profile; subscriptionId: string; price: string }) {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    const item = sub.items.data[0];
    if (!item || item.price.id === price) return this.createPortal({ profile });
    const customer = await ensureCustomer(profile);
    const session = await getStripe().billingPortal.sessions.create({
      ...portalBase(customer),
      flow_data: {
        type: 'subscription_update_confirm',
        subscription_update_confirm: { subscription: subscriptionId, items: [{ id: item.id, price, quantity: 1 }] },
        after_completion: { type: 'redirect', redirect: { return_url: `${env.siteUrl}/app/compte?paiement=ok` } },
      },
    });
    return session.url;
  }

  async cancelAll({ profile }: { profile: Profile }) {
    if (!profile.stripe_customer_id) return;
    const subs = await getStripe().subscriptions.list({ customer: profile.stripe_customer_id, status: 'all', limit: 20 });
    for (const sub of subs.data) {
      if (['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(sub.status)) {
        await getStripe().subscriptions.cancel(sub.id);
      }
    }
  }

  /** Essai sans carte : l'abonnement s'annule tout seul à la fin si aucun moyen de paiement n'a été ajouté. */
  async startTrial({ profile, days }: { profile: Profile; days: number }) {
    const price = priceIdFor('pro', 'month');
    if (!price) throw new BillingUnavailableError('STRIPE_PRICE_PRO_MONTHLY manquant : essai impossible.');
    const customer = await ensureCustomer(profile);
    const sub = await getStripe().subscriptions.create({
      customer,
      items: [{ price }],
      trial_period_days: days,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: { user_id: profile.id, origine: 'formateur' },
    });
    // Application immédiate (le webhook confirmera ensuite, sans effet de bord).
    await handleBillingEvent({ ...normalizeStripeSubscription(sub as unknown as Loose, `essai-${sub.id}`), userId: profile.id });
  }
}
