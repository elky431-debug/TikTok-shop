'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getLiveCatalog } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import { ensureSearchProduct } from '@/lib/radar/search-products';
import { getFavorites, toggleFavorite } from '@/lib/radar/settings';
import { regionFor } from '@/lib/regions';
import { parisDate } from '@/lib/utils';
import { launchHref, type LaunchStep } from '@/lib/v2/launch';
import { closeLaunch, launchForProduct, startLaunch } from '@/lib/v2/launch-store';

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

/** Ouvre (ou reprend) le lancement du produit, à une étape ; au-delà de la limite de suivis du plan, retour à la carte. */
async function openLaunch(formData: FormData, step?: LaunchStep) {
  const { profile, repo, found, back } = await product(formData);
  const sep = back.includes('?') ? '&' : '?';
  const result = await startLaunch(repo, profile, found.id, parisDate());
  if (!result.ok) redirect(`${back}${sep}suivi=limite#r-${found.id}`);
  revalidatePath('/app/recherche');
  revalidatePath('/app');
  revalidatePath('/app/lancer');
  redirect(launchHref(result.launch.id, step ?? result.launch.data.step, result.created ? { bravo: 'produit' } : {}));
}

/** « Lancer ce produit » : ouvre son lancement là où il en est. */
export async function searchLaunchAction(formData: FormData) {
  await openLaunch(formData);
}

/** « Écrire mes scripts » : ouvre le lancement à l'étape des scripts. */
export async function searchScriptsAction(formData: FormData) {
  await openLaunch(formData, 'scripts');
}

/**
 * Étoile : suivre le produit ouvre son lancement ; ne plus le suivre le retire des produits suivis (son lancement en
 * cours passe dans l'historique, comme abandonné).
 */
export async function searchFollowAction(formData: FormData) {
  const { profile, repo, found, back } = await product(formData);
  const sep = back.includes('?') ? '&' : '?';
  if (await repo.getSavedProduct(profile.id, found.id)) {
    await repo.removeSavedProduct(profile.id, found.id);
    const launch = await launchForProduct(repo, profile.id, found.id);
    if (launch?.data.state === 'en_cours') await closeLaunch(repo, profile.id, launch, 'abandonne', parisDate());
    revalidatePath('/app/recherche');
    revalidatePath('/app/lancer');
    redirect(`${back}${sep}suivi=retire#r-${found.id}`);
  }
  await openLaunch(formData);
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
