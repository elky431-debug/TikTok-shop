'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { startTask } from '@/lib/tasks/start';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { parisDate } from '@/lib/utils';
import { followUpDate, type OfferData, type OfferStatus } from '@/lib/v2/offers';
import { remainingToday } from '@/lib/v2/quota';

async function viewer() {
  const { profile } = await requireOnboardedViewer('/app/offres');
  const plan = getPlan(profile.plan);
  if (!plan.offersPerDay) redirect('/app/passer-pro');
  return { profile, plan };
}

export async function analyzeOfferAction(formData: FormData) {
  const { profile, plan } = await viewer();
  const text = String(formData.get('message') ?? '').trim();
  if (text.length < 30) redirect('/app/offres?erreur=court');
  if ((await remainingToday(profile.id, 'offre', plan.offersPerDay)) <= 0) redirect('/app/offres?erreur=quota');
  const path = await startTask(profile, 'offre', { message: text.slice(0, 6000) }, '/app/offres');
  revalidatePath('/app/offres');
  redirect(path);
}

/** Statut de la proposition et date de relance (vide = pas de relance). */
export async function setOfferStatusAction(formData: FormData) {
  const { profile } = await viewer();
  const repo = getRepo();
  const record = await repo.getRecord<OfferData>(profile.id, String(formData.get('id') ?? ''));
  const status = String(formData.get('statut') ?? '') as OfferStatus;
  if (!record || record.kind !== 'offre' || !['nouvelle', 'acceptee', 'negociee', 'refusee'].includes(status)) redirect('/app/offres');
  const rawDate = String(formData.get('relance') ?? '').trim();
  const followUp = rawDate ? followUpDate(rawDate, parisDate()) : null;
  if (rawDate && !followUp) redirect(`/app/offres?offre=${record.id}&erreur=relance`);
  await repo.saveRecord<OfferData>(
    profile.id,
    'offre',
    { ...record.data, status, follow_up_on: followUp, follow_up_sent: followUp === record.data.follow_up_on ? (record.data.follow_up_sent ?? null) : null },
    record.id,
  );
  revalidatePath('/app/offres');
  redirect(`/app/offres?offre=${record.id}&ok=statut`);
}

export async function deleteOfferAction(formData: FormData) {
  const { profile } = await viewer();
  const repo = getRepo();
  const record = await repo.getRecord(profile.id, String(formData.get('id') ?? ''));
  if (record?.kind === 'offre') await repo.deleteRecord(profile.id, record.id);
  revalidatePath('/app/offres');
  redirect('/app/offres?ok=suppression');
}
