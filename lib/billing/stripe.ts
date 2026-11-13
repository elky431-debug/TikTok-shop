import Stripe from 'stripe';
import { getRepo } from '@/lib/db';
import type { BillingInterval, Profile } from '@/lib/db/types';
import { env } from '@/lib/env';
import type { PaidPlanId } from '@/lib/plans';
import { COACH_COUPON_ID } from './coach-discount';
import { WITHDRAWAL_CONSENT_VERSION } from './consent';
import { planFromPrice, priceLookupKey } from './prices';
import {
  BillingUnavailableError,
  type BillingEvent,
  type BillingProvider,
  type CheckoutInput,
  type SubscriptionChanged,
} from './types';

/**
 * Implémentation Stripe : Checkout, portail client, webhooks.
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
  const mapped = planFromPrice({
    id: priceId,
    lookup_key: (price.lookup_key as string | null | undefined) ?? null,
    metadata: (price.metadata as Record<string, string> | undefined) ?? null,
    recurring: (price.recurring as { interval?: string } | undefined) ?? null,
  });
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

/** Identifiants de prix déjà retrouvés (par clé de recherche), pour ne pas interroger Stripe à chaque paiement. */
const priceCache = new Map<string, string>();

/** Prix actif d'un plan, retrouvé par sa `lookup_key` (posée par « npm run stripe:setup »). */
export async function stripePriceId(plan: PaidPlanId, interval: BillingInterval): Promise<string> {
  const key = priceLookupKey(plan, interval);
  const cached = priceCache.get(key);
  if (cached) return cached;
  const found = await getStripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const id = found.data[0]?.id;
  if (!id) throw new BillingUnavailableError(`Prix Stripe introuvable (${key}) : lance « npm run stripe:setup ».`);
  priceCache.set(key, id);
  return id;
}

export function clearPriceCacheForTests() {
  priceCache.clear();
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
 * Session Checkout d'un nouvel abonnement. Avec le code formateur, le coupon « −20 % sur le premier mois » est appliqué
 * d'office (Stripe interdit alors le champ « code promotionnel ») ; sinon ce champ reste affiché. La demande de
 * démarrage immédiat (case cochée avant d'arriver ici) est rappelée sous le bouton de paiement et gardée dans les
 * métadonnées de la session et de l'abonnement.
 */
export function checkoutSessionParams(input: {
  customer: string;
  userId: string;
  price: string;
  siteUrl: string;
  coachDiscount?: boolean;
  consentAt?: string;
}): Stripe.Checkout.SessionCreateParams {
  const consent: Record<string, string> = input.consentAt
    ? { demarrage_immediat: input.consentAt, demarrage_immediat_version: WITHDRAWAL_CONSENT_VERSION }
    : {};
  return {
    mode: 'subscription',
    customer: input.customer,
    client_reference_id: input.userId,
    line_items: [{ price: input.price, quantity: 1 }],
    subscription_data: { metadata: { user_id: input.userId, ...consent } },
    metadata: { user_id: input.userId, ...consent },
    ...(input.coachDiscount ? { discounts: [{ coupon: COACH_COUPON_ID }] } : { allow_promotion_codes: true }),
    custom_text: {
      submit: {
        message:
          'Tu as demandé que ton abonnement démarre tout de suite. Si tu te rétractes dans les 14 jours, tu paieras le service fourni jusque-là, au prorata.',
      },
    },
    locale: 'fr',
    success_url: `${input.siteUrl}/app?paiement=ok`,
    cancel_url: `${input.siteUrl}/abonnement?paiement=annule`,
  };
}

export class StripeBilling implements BillingProvider {
  readonly name = 'stripe' as const;

  async createCheckout({ profile, plan, interval, coachDiscount, consentAt }: CheckoutInput) {
    const price = await stripePriceId(plan, interval);
    // Déjà abonné : changement de plan dans le portail, directement sur l'écran de confirmation du nouveau prix
    // (prorata calculé et affiché par Stripe), pas de second abonnement.
    const active = await getRepo().getActiveSubscription(profile.id);
    if (active?.provider === 'stripe') return this.changePlan({ profile, subscriptionId: active.id, price });

    const customer = await ensureCustomer(profile);
    const session = await getStripe().checkout.sessions.create(
      checkoutSessionParams({ customer, userId: profile.id, price, siteUrl: env.siteUrl, coachDiscount, consentAt }),
    );
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
}
