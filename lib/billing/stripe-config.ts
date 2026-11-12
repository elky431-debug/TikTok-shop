import type Stripe from 'stripe';
import { BRAND_SLUG } from '@/lib/brand';

/**
 * Réglages Stripe partagés par « npm run stripe:setup », les tests et la doc. Noms d'événements et de champs tirés
 * des types officiels du SDK `stripe` (générés depuis la spécification OpenAPI de Stripe).
 */

/** Événements à envoyer au webhook : chacun est traité par normalizeStripeEvent. */
export const STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
] as const satisfies ReadonlyArray<Stripe.WebhookEndpointCreateParams.EnabledEvent>;

/** Marque des objets créés par le script, pour les retrouver sans doublon. */
export const STRIPE_SETUP_METADATA = { app: BRAND_SLUG };

/**
 * Portail client : changer de plan ou de période (prorata immédiat), résilier en fin de période avec un motif, changer
 * de carte, factures, coordonnées de facturation.
 */
export function portalConfiguration(input: {
  siteUrl: string;
  products: Array<{ product: string; prices: string[] }>;
}): Stripe.BillingPortal.ConfigurationCreateParams {
  const site = input.siteUrl.replace(/\/$/, '');
  return {
    name: `${BRAND_SLUG} : changement de plan et résiliation`,
    default_return_url: `${site}/app/compte`,
    business_profile: { privacy_policy_url: `${site}/confidentialite`, terms_of_service_url: `${site}/cgv` },
    metadata: STRIPE_SETUP_METADATA,
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'name', 'address', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'unused', 'switched_service', 'other'],
        },
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        products: input.products,
        proration_behavior: 'create_prorations',
      },
    },
  };
}
