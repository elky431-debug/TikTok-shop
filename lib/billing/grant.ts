import { getRepo, type Repo } from '@/lib/db';
import type { PaidPlanId } from '@/lib/plans';
import { randomId } from '@/lib/utils';
import { handleBillingEvent } from './events';

/**
 * Plan offert (admin, comptes de démonstration) : un abonnement « admin_<id> » sans paiement ni facture (donc sans
 * commission ni chiffre d'affaires), qui passe par le même traitement que les autres. `null` le retire. Un
 * abonnement payé plus élevé reste prioritaire.
 */
export async function grantPlan(userId: string, plan: PaidPlanId | null, repo: Repo = getRepo()): Promise<void> {
  const id = `admin_${userId}`;
  const existing = await repo.getSubscription(id);
  if (!plan && !existing) return;
  await handleBillingEvent(
    {
      kind: 'subscription',
      eventId: `admin_evt_${randomId()}`,
      provider: 'simulation',
      subscriptionId: id,
      customerId: null,
      userId,
      status: plan ? 'active' : 'canceled',
      plan: plan ?? (existing?.plan === 'starter' || existing?.plan === 'pro' || existing?.plan === 'elite' ? existing.plan : null),
      interval: 'month',
      priceId: null,
      currentPeriodEnd: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
    },
    repo,
  );
}
