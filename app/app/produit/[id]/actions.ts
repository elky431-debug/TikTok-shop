'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { createProvider, type ProviderName } from '@/lib/data';
import { getRepo } from '@/lib/db';
import { videosAreFresh } from '@/lib/jobs/refresh';
import { DEFAULT_VIDEO_GOAL, isPaidPlan } from '@/lib/plans';
import { canAccessProduct } from '@/lib/radar';

export async function saveProductAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer();
  const productId = String(formData.get('produit') ?? '');
  const repo = getRepo();
  const product = await repo.getProduct(productId);
  if (!product || !(await canAccessProduct(profile, productId))) redirect('/app');
  await repo.saveProduct(profile.id, productId, DEFAULT_VIDEO_GOAL);
  revalidatePath(`/app/produit/${productId}`);
  revalidatePath('/app/mes-produits');
  revalidatePath('/app');
}

/**
 * Vidéos qui vendent, à la demande (Pro et Pro+) : un seul appel à la source par produit tous les 3 jours, quel que
 * soit le nombre de personnes qui ouvrent la fiche.
 */
export async function loadVideosAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer();
  const productId = String(formData.get('produit') ?? '');
  const back = `/app/produit/${encodeURIComponent(productId)}`;
  const repo = getRepo();
  const product = await repo.getProduct(productId);
  if (!product || !(await canAccessProduct(profile, productId))) redirect('/app');
  if (!isPaidPlan(profile.plan)) redirect('/app/passer-pro');
  if (!videosAreFresh(product.videos_fetched_at)) {
    try {
      const videos = await createProvider(product.provider as ProviderName).fetchTopVideos(product.id);
      await repo.updateProductVideos(product.id, videos, new Date().toISOString());
    } catch (error) {
      console.error('[vidéos] chargement', product.id, error instanceof Error ? error.message : error);
      redirect(`${back}?videos=erreur#videos`);
    }
  }
  revalidatePath(back);
  redirect(`${back}#videos`);
}
