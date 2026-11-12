import type { BillingInterval, PlanId, Profile } from '@/lib/db/types';

/**
 * Interface de paiement indépendante du prestataire. Changer de prestataire (Lemon Squeezy, Paddle…)
 * = écrire une nouvelle implémentation de BillingProvider + sa normalisation des webhooks.
 * Le reste de l'appli ne parle qu'à cette interface et aux événements normalisés.
 */

export type ProviderName = 'stripe' | 'simulation' | 'disabled';

export interface BillingProvider {
  readonly name: ProviderName;
  /** URL où envoyer l'utilisateur pour payer. */
  createCheckout(input: { profile: Profile; plan: Exclude<PlanId, 'free'>; interval: BillingInterval }): Promise<string>;
  /** URL du portail client (moyen de paiement, factures, résiliation). */
  createPortal(input: { profile: Profile }): Promise<string>;
  /** Démarre l'essai Pro offert aux élèves d'un formateur. */
  startTrial(input: { profile: Profile; days: number }): Promise<void>;
  /** Résilie immédiatement tout abonnement (suppression du compte). */
  cancelAll(input: { profile: Profile }): Promise<void>;
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
  plan: Exclude<PlanId, 'free'> | null;
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

export interface IgnoredEvent {
  kind: 'ignored';
  eventId: string;
  type: string;
}

export type BillingEvent = SubscriptionChanged | InvoicePaid | CheckoutCompleted | IgnoredEvent;

/** Statuts qui donnent accès au plan payant. */
export const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];
