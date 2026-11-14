import type { BillingInterval, Profile } from '@/lib/db/types';
import type { PaidPlanId } from '@/lib/plans';

/**
 * Interface de paiement indépendante du prestataire. Changer de prestataire (Lemon Squeezy, Paddle…)
 * = écrire une nouvelle implémentation de BillingProvider + sa normalisation des webhooks.
 * Le reste de l'appli ne parle qu'à cette interface et aux événements normalisés.
 */

export type ProviderName = 'stripe' | 'simulation' | 'disabled';

export interface BillingProvider {
  readonly name: ProviderName;
  /**
   * URL où envoyer l'utilisateur pour payer. `consentAt` : date de la demande de démarrage immédiat (case obligatoire,
   * voir lib/billing/consent.ts). Les codes promotionnels se saisissent sur la page de paiement.
   */
  createCheckout(input: CheckoutInput): Promise<string>;
  /**
   * URL du portail client (moyen de paiement, factures, résiliation). `flow` ouvre directement une étape :
   * changer de moyen de paiement (après un échec de paiement).
   */
  createPortal(input: { profile: Profile; flow?: 'payment_method_update' }): Promise<string>;
  /** Résilie immédiatement tout abonnement (suppression du compte). */
  cancelAll(input: { profile: Profile }): Promise<void>;
}

export interface CheckoutInput {
  profile: Profile;
  plan: PaidPlanId;
  interval: BillingInterval;
  consentAt: string;
}

export class BillingUnavailableError extends Error {
  constructor(message = 'Le paiement n’est pas encore activé sur ce site. Aucun prélèvement n’est possible pour le moment.') {
    super(message);
    this.name = 'BillingUnavailableError';
  }
}

/** Événements normalisés, produits par chaque prestataire à partir de ses webhooks. */
export interface SubscriptionChanged {
  kind: 'subscription';
  eventId: string;
  provider: 'stripe' | 'simulation';
  subscriptionId: string;
  customerId: string | null;
  userId: string | null;
  status: string;
  plan: PaidPlanId | null;
  interval: BillingInterval | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface InvoicePaid {
  kind: 'invoice_paid';
  eventId: string;
  provider: 'stripe' | 'simulation';
  invoiceId: string;
  customerId: string | null;
  subscriptionId: string | null;
  userId: string | null;
  /** Montant encaissé hors taxes, en centimes. */
  amountCents: number;
  paidAt: string;
}

export interface CheckoutCompleted {
  kind: 'checkout_completed';
  eventId: string;
  provider: 'stripe' | 'simulation';
  customerId: string | null;
  userId: string | null;
  subscriptionId: string | null;
}

/** Remboursement (total ou partiel) d'un paiement : la commission de la facture est annulée au prorata. */
export interface PaymentRefunded {
  kind: 'refund';
  eventId: string;
  provider: 'stripe' | 'simulation';
  /** Facture remboursée ; chez Stripe, retrouvée à partir du paiement (voir enrichStripeEvent). */
  invoiceId: string | null;
  paymentIntentId: string | null;
  customerId: string | null;
  /** Montant payé et montant remboursé (cumulé), en centimes. */
  amountCents: number;
  refundedCents: number;
}

/** Échec d'un prélèvement : l'abonné est prévenu par e-mail ; Stripe réessaie selon ses réglages. */
export interface PaymentFailed {
  kind: 'payment_failed';
  eventId: string;
  provider: 'stripe' | 'simulation';
  invoiceId: string;
  customerId: string | null;
  subscriptionId: string | null;
  userId: string | null;
  amountDueCents: number;
  attemptCount: number;
  nextAttemptAt: string | null;
}

export interface IgnoredEvent {
  kind: 'ignored';
  eventId: string;
  type: string;
}

export type BillingEvent = SubscriptionChanged | InvoicePaid | CheckoutCompleted | PaymentRefunded | PaymentFailed | IgnoredEvent;

/** Statuts qui donnent accès au plan payant. */
export const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];
