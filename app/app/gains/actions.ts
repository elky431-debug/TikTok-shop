'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { parseAmount, parseDate, parseEarningsCsv, type EarningData } from '@/lib/v2/earnings';

async function viewer() {
  const { profile } = await requireOnboardedViewer('/app/gains');
  if (!getPlan(profile.plan).earnings) redirect('/app/passer-pro');
  return profile;
}

export async function addEarningAction(formData: FormData) {
  const profile = await viewer();
  const date = parseDate(String(formData.get('date') ?? ''));
  const amount = parseAmount(String(formData.get('montant') ?? ''));
  const product = String(formData.get('produit') ?? '').trim();
  if (!date || amount === null || !product) redirect('/app/gains?erreur=saisie');
  const sales = Number(formData.get('ventes'));
  const data: EarningData = {
    date,
    product_name: product.slice(0, 200),
    product_id: null,
    video: String(formData.get('video') ?? '').trim().slice(0, 300) || null,
    amount_cents: amount,
    sales: Number.isFinite(sales) && sales > 0 ? Math.round(sales) : null,
    source: 'saisie',
  };
  await getRepo().saveRecord(profile.id, 'gain', data);
  revalidatePath('/app/gains');
  redirect('/app/gains?ok=ajout');
}

export async function importEarningsAction(formData: FormData) {
  const profile = await viewer();
  const file = formData.get('fichier');
  const text = file instanceof File && file.size ? await file.text() : String(formData.get('texte') ?? '');
  if (!text.trim()) redirect('/app/gains?erreur=fichier');
  if (text.length > 2_000_000) redirect('/app/gains?erreur=taille');
  const result = parseEarningsCsv(text);
  if (!result.rows.length) redirect(`/app/gains?erreur=import&detail=${encodeURIComponent(result.errors[0] ?? '')}`);
  const repo = getRepo();
  for (const row of result.rows.slice(0, 2000)) await repo.saveRecord(profile.id, 'gain', row);
  revalidatePath('/app/gains');
  redirect(`/app/gains?ok=import&lignes=${result.rows.length}&ignorees=${result.errors.length}`);
}

export async function deleteEarningAction(formData: FormData) {
  const profile = await viewer();
  await getRepo().deleteRecord(profile.id, String(formData.get('id') ?? ''));
  revalidatePath('/app/gains');
  redirect('/app/gains?ok=suppression');
}
