'use server';

import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { simulateCancel, simulateSubscription } from '@/lib/billing/simulated';
import { isBillingInterval } from '@/lib/plans';

/** Uniquement en mode local : jamais disponible quand Stripe ou Supabase sont configurés. */
function assertSimulation() {
  if (billingMode() !== 'simulation') redirect('/app/passer-pro?erreur=indisponible');
}

export async function confirmSimulatedPayment(formData: FormData) {
  assertSimulation();
  const { profile } = await requireOnboardedViewer('/app/passer-pro');
  const plan = formData.get('plan');
  const interval = formData.get('periode');
  if ((plan !== 'pro' && plan !== 'proplus') || !isBillingInterval(interval)) redirect('/app/passer-pro?erreur=plan');
  await simulateSubscription(profile, plan, interval);
  redirect('/app/compte?paiement=ok');
}

export async function cancelSimulatedSubscription() {
  assertSimulation();
  const { profile } = await requireOnboardedViewer('/app/compte');
  await simulateCancel(profile);
  redirect('/app/compte?resiliation=ok');
}
