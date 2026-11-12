'use server';

import { revalidatePath } from 'next/cache';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';

async function current(productId: string) {
  const { profile } = await requireOnboardedViewer('/app/mes-produits');
  const row = await getRepo().getSavedProduct(profile.id, productId);
  return { profile, row };
}

/** +1 ou −1 vidéo postée (saisie manuelle en V1). */
export async function changeVideoCountAction(formData: FormData) {
  const productId = String(formData.get('produit') ?? '');
  const delta = Number(formData.get('delta')) === -1 ? -1 : 1;
  const { profile, row } = await current(productId);
  if (!row) return;
  await getRepo().updateSavedProduct(profile.id, productId, { videos_posted: Math.max(0, Math.min(999, row.videos_posted + delta)) });
  revalidatePath('/app/mes-produits');
}

export async function setVideoGoalAction(formData: FormData) {
  const productId = String(formData.get('produit') ?? '');
  const goal = Math.round(Number(formData.get('objectif')));
  const { profile, row } = await current(productId);
  if (!row || !Number.isFinite(goal)) return;
  await getRepo().updateSavedProduct(profile.id, productId, { video_goal: Math.max(1, Math.min(200, goal)) });
  revalidatePath('/app/mes-produits');
}

export async function removeSavedProductAction(formData: FormData) {
  const productId = String(formData.get('produit') ?? '');
  const { profile } = await current(productId);
  await getRepo().removeSavedProduct(profile.id, productId);
  revalidatePath('/app/mes-produits');
  revalidatePath('/app');
}
