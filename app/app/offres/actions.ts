'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { extractOffer, scoreOffer, writeReplies, type OfferData, type OfferStatus } from '@/lib/v2/offers';
import { remainingToday } from '@/lib/v2/quota';

export async function analyzeOfferAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/offres');
  const plan = getPlan(profile.plan);
  if (!plan.offersPerDay) redirect('/app/passer-pro');
  const text = String(formData.get('message') ?? '').trim();
  if (text.length < 30) redirect('/app/offres?erreur=court');
  if ((await remainingToday(profile.id, 'offre', plan.offersPerDay)) <= 0) redirect('/app/offres?erreur=quota');
  const repo = getRepo();
  let id: string;
  try {
    const extracted = await extractOffer(text);
    const radar = await repo.listProducts(extracted.data.niche ? { niches: [extracted.data.niche] } : {});
    const score = scoreOffer(extracted.data, radar);
    const replies = await writeReplies(extracted.data, score, profile.first_name);
    const data: OfferData = {
      text: text.slice(0, 6000),
      extracted: extracted.data,
      score,
      replies: replies.data,
      status: 'nouvelle',
      simulated: extracted.simulated || replies.simulated,
    };
    id = (await repo.saveRecord(profile.id, 'offre', data)).id;
  } catch (error) {
    console.error('[propositions]', error instanceof Error ? error.message : error);
    redirect('/app/offres?erreur=ia');
  }
  revalidatePath('/app/offres');
  redirect(`/app/offres?offre=${id}`);
}

export async function setOfferStatusAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/offres');
  const repo = getRepo();
  const record = await repo.getRecord<OfferData>(profile.id, String(formData.get('id') ?? ''));
  const status = String(formData.get('statut') ?? '') as OfferStatus;
  if (!record || !['nouvelle', 'acceptee', 'negociee', 'refusee'].includes(status)) redirect('/app/offres');
  await repo.saveRecord(profile.id, 'offre', { ...record.data, status }, record.id);
  revalidatePath('/app/offres');
  redirect(`/app/offres?offre=${record.id}`);
}
