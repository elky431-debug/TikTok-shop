'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { recordDailyMetrics } from '@/lib/admin/metrics';
import { requireAdmin } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import type { CoachApplication } from '@/lib/db/types';
import { triggerDiscordHourly, triggerNightly } from '@/lib/jobs/trigger';
import { grantPlan } from '@/lib/billing/grant';
import { parsePaidPlan, REFERRAL_COMMISSION_RATE } from '@/lib/plans';
import { addCoachCode, isCodeTaken, isValidCode, normalizeCode, recordPayout } from '@/lib/referral';
import { parisDate } from '@/lib/utils';

export async function makeCoachAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get('utilisateur') ?? '');
  const trainingName = String(formData.get('formation') ?? '').trim().slice(0, 120);
  const promoCode = normalizeCode(String(formData.get('code') ?? ''));
  if (!userId || !trainingName) redirect('/admin/utilisateurs?erreur=formation');
  if (!isValidCode(promoCode)) redirect('/admin/utilisateurs?erreur=code');
  const repo = getRepo();
  if (await isCodeTaken(promoCode, repo)) redirect('/admin/utilisateurs?erreur=code-pris');
  try {
    await repo.createCoach({ user_id: userId, training_name: trainingName, promo_code: promoCode, commission_rate: REFERRAL_COMMISSION_RATE });
  } catch (error) {
    redirect(`/admin/utilisateurs?erreur=${encodeURIComponent(error instanceof Error ? error.message : 'creation')}`);
  }
  revalidatePath('/admin', 'layout');
  redirect('/admin/formateurs?ok=formateur');
}

/** Code supplémentaire créé par l'admin pour un formateur (mêmes règles que depuis l'espace formateur). */
export async function addCoachCodeAction(formData: FormData) {
  await requireAdmin();
  const coach = await getRepo().getCoachById(String(formData.get('formateur') ?? ''));
  if (!coach) redirect('/admin/formateurs?erreur=formateur');
  const result = await addCoachCode(coach, String(formData.get('code') ?? ''), String(formData.get('libelle') ?? ''));
  revalidatePath('/admin/formateurs');
  redirect(result.ok ? '/admin/formateurs?ok=code' : `/admin/formateurs?erreur=code-${result.error}`);
}

/** Versement manuel (V1) : l'admin a fait le virement, il le note ici ; jamais plus que le solde dû. */
export async function markPayoutAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get('beneficiaire') ?? '');
  const euros = Number(String(formData.get('montant') ?? '').replace(',', '.').replace(/\s/g, ''));
  const result = await recordPayout(userId, {
    amountCents: Math.round(euros * 100),
    paidOn: String(formData.get('date') ?? '') || parisDate(),
    reference: String(formData.get('reference') ?? ''),
  });
  revalidatePath('/admin/formateurs');
  redirect(result.ok ? '/admin/formateurs?ok=versement#versements' : `/admin/formateurs?erreur=versement-${result.error}#versements`);
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
  let outcome: 'ok' | 'repli' | 'lance' = 'ok';
  try {
    const result = await triggerNightly('manuel');
    if (result.queued) outcome = 'lance';
    else if (result.result.fallbacks.length > 0) outcome = 'repli';
  } catch {
    redirect('/admin?erreur=rafraichissement#taches');
  }
  revalidatePath('/admin');
  revalidatePath('/app');
  redirect(outcome === 'lance' ? '/admin?ok=lance#taches' : outcome === 'repli' ? '/admin?ok=repli#taches' : '/admin?ok=rafraichissement#taches');
}

/** Relance la tâche horaire Discord (récaps privés dus, salons, rôles, classement) : rien n'est envoyé deux fois. */
export async function runDiscordAction() {
  await requireAdmin();
  try {
    await triggerDiscordHourly();
  } catch {
    redirect('/admin?erreur=discord#taches');
  }
  redirect('/admin?ok=discord#taches');
}

/** Relève les chiffres de la veille s'ils manquent (actifs, scripts, appels d'IA). */
export async function recordMetricsAction() {
  await requireAdmin();
  await recordDailyMetrics();
  revalidatePath('/admin');
  redirect('/admin?ok=releve#indicateurs');
}

/**
 * Plan donné à la main par l'admin (compte de test, partenaire, geste commercial) : un abonnement « offert », sans
 * paiement ni facture (donc sans commission), qui passe par le même traitement que les autres. « Sans abonnement »
 * le retire. Un abonnement Stripe en cours reste prioritaire s'il est plus élevé.
 */
export async function grantPlanAction(formData: FormData) {
  await requireAdmin();
  const repo = getRepo();
  const profile = await repo.getProfile(String(formData.get('utilisateur') ?? ''));
  const value = String(formData.get('plan') ?? '');
  const plan = parsePaidPlan(value);
  if (!profile || (!plan && value !== 'aucun')) redirect('/admin/utilisateurs?erreur=plan');
  try {
    await grantPlan(profile.id, plan, repo);
  } catch (error) {
    // Base pas encore migrée (valeurs starter/elite/aucun inconnues) : message clair plutôt qu'une page d'erreur.
    console.error('[admin] plan offert', error instanceof Error ? error.message : error);
    redirect('/admin/utilisateurs?erreur=base');
  }
  revalidatePath('/admin', 'layout');
  redirect(`/admin/utilisateurs?q=${encodeURIComponent(profile.email)}&ok=plan`);
}
