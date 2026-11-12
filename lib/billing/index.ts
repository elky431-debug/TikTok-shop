import { isLocalMode, isStripeConfigured } from '@/lib/env';
import { simulateCancel, simulateTrial, SimulatedBilling } from './simulated';
import { StripeBilling } from './stripe';
import { BillingUnavailableError, type BillingProvider } from './types';

export * from './types';

/** Paiement désactivé (Supabase configuré mais pas Stripe) : message clair, aucun prélèvement. */
class DisabledBilling implements BillingProvider {
  readonly name = 'disabled' as const;
  async createCheckout(): Promise<string> {
    throw new BillingUnavailableError();
  }
  async createPortal(): Promise<string> {
    throw new BillingUnavailableError();
  }
  /** L'essai formateur reste offert : il est suivi localement jusqu'à l'activation de Stripe. */
  async startTrial(input: Parameters<BillingProvider['startTrial']>[0]) {
    await simulateTrial(input.profile, input.days);
  }
  async cancelAll(input: Parameters<BillingProvider['cancelAll']>[0]) {
    await simulateCancel(input.profile);
  }
}

/** Prestataire actif : Stripe si la clé existe, simulation en mode local, sinon désactivé. */
export function getBilling(): BillingProvider {
  if (isStripeConfigured()) return new StripeBilling();
  if (isLocalMode()) return new SimulatedBilling();
  return new DisabledBilling();
}

export function billingMode(): BillingProvider['name'] {
  return getBilling().name;
}
