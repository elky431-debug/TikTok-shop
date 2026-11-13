'use server';

import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { coachDiscountApplies } from '@/lib/billing/coach-discount';
import { simulateCancel, simulateSubscription } from '@/lib/billing/simulated';
import { getRepo } from '@/lib/db';
import { isBillingInterval, parsePaidPlan } from '@/lib/plans';

/** Uniquement en mode local : jamais disponible quand Stripe ou Supabase sont configurés. */
function assertSimulation() {
  if (billingMode() !== 'simulation') redirect('/app/passer-pro?erreur=indisponible');
}

export async function confirmSimulatedPayment(formData: FormData) {
  assertSimulation();
  const { profile } = await requireOnboardedViewer('/app/passer-pro', { abonnement: false });
  const plan = parsePaidPlan(formData.get('plan'));
  const interval = formData.get('periode');
  if (!plan || !isBillingInterval(interval)) redirect('/app/passer-pro?erreur=plan');
  const repo = getRepo();
  const coachDiscount = await coachDiscountApplies(repo, profile, interval);
  await simulateSubscription(profile, plan, interval, repo, { coachDiscount });
  redirect('/app?paiement=ok');
}

export async function cancelSimulatedSubscription() {
  assertSimulation();
  const { profile } = await requireOnboardedViewer('/app/compte', { abonnement: false });
  await simulateCancel(profile);
  redirect('/app/compte?resiliation=ok');
}
