'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import type { CoachApplication } from '@/lib/db/types';
import { runNightly } from '@/lib/jobs/nightly';
import { REFERRAL_COMMISSION_RATE } from '@/lib/plans';
import { normalizeCode } from '@/lib/referral';

export async function makeCoachAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get('utilisateur') ?? '');
  const trainingName = String(formData.get('formation') ?? '').trim().slice(0, 120);
  const promoCode = normalizeCode(String(formData.get('code') ?? ''));
  if (!userId || !trainingName) redirect('/admin?erreur=formation#utilisateurs');
  if (!/^[A-Z0-9-]{3,24}$/.test(promoCode)) redirect('/admin?erreur=code#utilisateurs');
  const repo = getRepo();
  if ((await repo.getCoachByPromoCode(promoCode)) || (await repo.getProfileByReferralCode(promoCode))) {
    redirect('/admin?erreur=code-pris#utilisateurs');
  }
  try {
    await repo.createCoach({ user_id: userId, training_name: trainingName, promo_code: promoCode, commission_rate: REFERRAL_COMMISSION_RATE });
  } catch (error) {
    redirect(`/admin?erreur=${encodeURIComponent(error instanceof Error ? error.message : 'creation')}#utilisateurs`);
  }
  revalidatePath('/admin');
  redirect('/admin?ok=formateur#formateurs');
}

export async function setApplicationStatusAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('demande') ?? '');
  const status = String(formData.get('statut') ?? '') as CoachApplication['status'];
  if (!['nouvelle', 'acceptee', 'refusee'].includes(status)) redirect('/admin#demandes');
  await getRepo().updateCoachApplication(id, status);
  revalidatePath('/admin');
  redirect('/admin#demandes');
}

export async function runRefreshAction() {
  await requireAdmin();
  let fallback = false;
  try {
    const result = await runNightly({ trigger: 'manuel' });
    fallback = result.fallbacks.length > 0;
  } catch {
    redirect('/admin?erreur=rafraichissement#taches');
  }
  revalidatePath('/admin');
  revalidatePath('/app');
  redirect(fallback ? '/admin?ok=repli#taches' : '/admin?ok=rafraichissement#taches');
}
