import { getRepo, type Repo } from '@/lib/db';
import type { BillingInterval, Profile } from '@/lib/db/types';
import { getPlan, type PaidPlanId } from '@/lib/plans';
import { randomId } from '@/lib/utils';
import { handleBillingEvent } from './events';
import type { BillingProvider, CheckoutInput } from './types';

/**
 * Paiement simulé : uniquement en mode local (aucune clé), pour tester tout le parcours.
 * Il produit les mêmes événements normalisés que Stripe et passe par le même traitement
 * (handleBillingEvent) : plan, parrainage et commissions se comportent comme en vrai. Pas de champ de code promo ici.
 */

type PaidPlan = PaidPlanId;

const subId = (userId: string) => `sim_${userId}`;
const addDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

export async function simulateSubscription(
  profile: Profile,
  plan: PaidPlan,
  interval: BillingInterval,
  repo: Repo = getRepo(),
): Promise<void> {
  const base = {
    provider: 'simulation' as const,
    subscriptionId: subId(profile.id),
    customerId: null,
    userId: profile.id,
  };
  await handleBillingEvent(
    {
      kind: 'subscription',
      eventId: `sim_evt_${randomId()}`,
      ...base,
      status: 'active',
      plan,
      interval,
      priceId: `sim_${plan}_${interval}`,
      currentPeriodEnd: addDays(interval === 'year' ? 365 : 30),
      trialEnd: null,
      cancelAtPeriodEnd: false,
    },
    repo,
  );
  await handleBillingEvent(
    {
      kind: 'invoice_paid',
      eventId: `sim_evt_${randomId()}`,
      ...base,
      invoiceId: `sim_inv_${randomId()}`,
      amountCents: getPlan(plan).prices[interval],
      paidAt: new Date().toISOString(),
    },
    repo,
  );
}

export async function simulateCancel(profile: Profile, repo: Repo = getRepo()): Promise<void> {
  const sub = await repo.getSubscription(subId(profile.id));
  if (!sub) return;
  await handleBillingEvent(
    {
      kind: 'subscription',
      eventId: `sim_evt_${randomId()}`,
      provider: 'simulation',
      subscriptionId: sub.id,
      customerId: null,
      userId: profile.id,
      status: 'canceled',
      plan: sub.plan === 'aucun' ? null : sub.plan,
      interval: sub.billing_interval,
      priceId: sub.price_id,
      currentPeriodEnd: new Date().toISOString(),
      trialEnd: sub.trial_end,
      cancelAtPeriodEnd: false,
    },
    repo,
  );
}

/**
 * Fin des essais simulés arrivés à échéance (appelé par la tâche nocturne). Il n'y a plus d'essai : ceci ne fait que
 * terminer ceux ouverts avant la nouvelle grille.
 */
export async function expireSimulatedTrials(repo: Repo = getRepo(), now = new Date()): Promise<number> {
  const subs = await repo.listSubscriptions({ provider: 'simulation' });
  let expired = 0;
  for (const sub of subs) {
    if (sub.status === 'trialing' && sub.trial_end && new Date(sub.trial_end) < now) {
      const profile = await repo.getProfile(sub.user_id);
      if (profile) {
        await simulateCancel(profile, repo);
        expired++;
      }
    }
  }
  return expired;
}

export class SimulatedBilling implements BillingProvider {
  readonly name = 'simulation' as const;

  async createCheckout({ plan, interval }: CheckoutInput) {
    return `/app/paiement-simule?plan=${plan}&periode=${interval}`;
  }

  async createPortal() {
    return '/app/paiement-simule?mode=portail';
  }

  async cancelAll({ profile }: { profile: Profile }) {
    await simulateCancel(profile);
  }
}
