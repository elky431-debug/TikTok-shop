'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getLiveCatalog } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import { DEFAULT_VIDEO_GOAL, getPlan } from '@/lib/plans';
import { ensureSearchProduct } from '@/lib/radar/search-products';
import { getFavorites, toggleFavorite } from '@/lib/radar/settings';
import { regionFor } from '@/lib/regions';

/**
 * Actions rapides des cartes de la recherche. Chacune crée d'abord la fiche du produit s'il n'est pas encore en base
 * (à partir du résultat de la recherche de la personne, sans nouvel appel à la source), puis fait son travail.
 */
async function product(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/recherche');
  const repo = getRepo();
  const id = String(formData.get('produit') ?? '');
  const back = `/app/recherche${formData.get('recherche') ? `?id=${encodeURIComponent(String(formData.get('recherche')))}` : ''}`;
  const catalog = await getLiveCatalog(repo, new Date(), regionFor(profile));
  const found = id ? await ensureSearchProduct(repo, profile, id, catalog.products) : null;
  if (!found) redirect(`${back}${back.includes('?') ? '&' : '?'}erreur=produit`);
  return { profile, repo, found, back };
}

export async function searchScriptsAction(formData: FormData) {
  const { found } = await product(formData);
  redirect(`/app/studio?produit=${encodeURIComponent(found.id)}`);
}

/** Étoile : suivre le produit (Mes produits), ou ne plus le suivre. Limite du plan vérifiée ici. */
export async function searchFollowAction(formData: FormData) {
  const { profile, repo, found, back } = await product(formData);
  const sep = back.includes('?') ? '&' : '?';
  const saved = await repo.listSavedProducts(profile.id);
  if (saved.some((s) => s.product_id === found.id)) {
    await repo.removeSavedProduct(profile.id, found.id);
    revalidatePath('/app/recherche');
    redirect(`${back}${sep}suivi=retire#r-${found.id}`);
  }
  if (saved.length >= getPlan(profile.plan).savedProducts) redirect(`${back}${sep}suivi=limite#r-${found.id}`);
  await repo.saveProduct(profile.id, found.id, DEFAULT_VIDEO_GOAL);
  revalidatePath('/app/recherche');
  revalidatePath('/app');
  redirect(`${back}${sep}suivi=ok#r-${found.id}`);
}

/** Comparer : le produit rejoint les favoris et s'ouvre face à un favori (ou seul, avec une case à remplir). */
export async function searchCompareAction(formData: FormData) {
  const { profile, repo, found } = await product(formData);
  const favorites = await getFavorites(profile.id, repo);
  if (!favorites.includes(found.id)) await toggleFavorite(profile.id, found.id, repo);
  const other = favorites.find((id) => id !== found.id);
  revalidatePath('/app/comparer');
  redirect(
    `/app/comparer?ids=${[found.id, other]
      .filter(Boolean)
      .map((id) => encodeURIComponent(id!))
      .join(',')}`,
  );
}
