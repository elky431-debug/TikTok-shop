'use server';

import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getBilling } from '@/lib/billing';
import { BillingUnavailableError } from '@/lib/billing/types';
import { isBillingInterval } from '@/lib/plans';

export async function startCheckoutAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/passer-pro');
  const plan = formData.get('plan');
  const interval = formData.get('periode');
  if ((plan !== 'pro' && plan !== 'proplus') || !isBillingInterval(interval)) redirect('/app/passer-pro?erreur=plan');

  let url: string;
  try {
    url = await getBilling().createCheckout({ profile, plan, interval });
  } catch (error) {
    if (error instanceof BillingUnavailableError) redirect(`/app/passer-pro?erreur=indisponible`);
    console.error('[paiement] ouverture', error);
    redirect('/app/passer-pro?erreur=ouverture');
  }
  redirect(url);
}

export async function openPortalAction(formData?: FormData) {
  const { profile } = await requireOnboardedViewer('/app/compte');
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
