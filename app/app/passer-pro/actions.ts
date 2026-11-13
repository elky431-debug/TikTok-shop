'use server';

import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getBilling } from '@/lib/billing';
import { coachDiscountApplies } from '@/lib/billing/coach-discount';
import { consentGiven, recordConsent } from '@/lib/billing/consent';
import { BillingUnavailableError } from '@/lib/billing/types';
import { getRepo } from '@/lib/db';
import { getPlan, isBillingInterval, parsePaidPlan } from '@/lib/plans';

/**
 * Lance le paiement d'un abonnement (nouveau ou changement de plan), depuis /abonnement ou /app/passer-pro. La case
 * de démarrage immédiat est obligatoire : sans elle, rien n'est lancé. La demande est enregistrée avant d'ouvrir le
 * paiement ; le code formateur donne −20 % sur le premier mois.
 */
export async function startCheckoutAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/passer-pro', { abonnement: false });
  const back = getPlan(profile.plan).access ? '/app/passer-pro' : '/abonnement';
  const paidPlan = parsePaidPlan(formData.get('plan'));
  const interval = formData.get('periode');
  if (!paidPlan || !isBillingInterval(interval)) redirect(`${back}?erreur=plan`);
  if (!consentGiven(formData)) redirect(`${back}?erreur=demarrage&plan=${paidPlan}&periode=${interval}`);

  const repo = getRepo();
  let url: string;
  try {
    const coachDiscount = await coachDiscountApplies(repo, profile, interval);
    const consent = await recordConsent(repo, profile, { plan: paidPlan, interval, coachDiscount });
    url = await getBilling().createCheckout({ profile, plan: paidPlan, interval, coachDiscount, consentAt: consent.data.accepted_at });
  } catch (error) {
    if (error instanceof BillingUnavailableError) redirect(`${back}?erreur=indisponible`);
    console.error('[paiement] ouverture', error instanceof Error ? error.message : error);
    redirect(`${back}?erreur=ouverture`);
  }
  redirect(url);
}

export async function openPortalAction(formData?: FormData) {
  const { profile } = await requireOnboardedViewer('/app/compte', { abonnement: false });
  const flow = formData?.get('etape') === 'carte' ? ('payment_method_update' as const) : undefined;
  let url: string;
  try {
    url = await getBilling().createPortal({ profile, flow });
  } catch (error) {
    if (error instanceof BillingUnavailableError) redirect('/app/compte?erreur=paiement-indisponible');
    console.error('[paiement] portail', error);
    redirect('/app/compte?erreur=portail');
  }
  redirect(url);
}
