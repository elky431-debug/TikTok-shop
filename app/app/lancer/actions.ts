'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getLiveCatalog } from '@/lib/catalog';
import { ensureSearchProduct } from '@/lib/radar/search-products';
import { regionFor } from '@/lib/regions';
import { listBoards } from '@/lib/v2/board';
import { completeStep, isLaunchStep, launchHref } from '@/lib/v2/launch';
import { closeLaunch, getLaunch, reopenLaunch, saveLaunch, startLaunch, syncLaunchStage } from '@/lib/v2/launch-store';
import { parisDate } from '@/lib/utils';

function refresh(id?: string) {
  revalidatePath('/app');
  revalidatePath('/app/lancer');
  revalidatePath('/app/mes-produits');
  if (id) revalidatePath(`/app/lancer/${id}`);
}

/** Retour sûr vers une page de l'appli (jamais une autre adresse). */
function safeBack(raw: FormDataEntryValue | null, fallback: string): string {
  const value = String(raw ?? '');
  return value.startsWith('/app') && !value.startsWith('//') ? value : fallback;
}

/**
 * « Lancer ce produit », « Écrire mes scripts », étoile de suivi : ouvre ou reprend le lancement du produit (le produit
 * est suivi au passage). Un produit trouvé par une recherche reçoit d'abord sa fiche. `etape` : où ouvrir (par défaut,
 * là où le lancement en est).
 */
export async function startLaunchAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const productId = String(formData.get('produit') ?? '');
  const back = safeBack(formData.get('retour'), '/app/lancer/nouveau');
  const wanted = String(formData.get('etape') ?? '');
  if (!(await repo.getProduct(productId))) {
    const catalog = (await getLiveCatalog(repo, new Date(), regionFor(profile))).products;
    await ensureSearchProduct(repo, profile, productId, catalog);
  }
  const result = await startLaunch(repo, profile, productId, parisDate());
  const sep = back.includes('?') ? '&' : '?';
  if (!result.ok) redirect(`${back}${sep}lancement=${result.reason}`);
  refresh(result.launch.id);
  redirect(launchHref(result.launch.id, isLaunchStep(wanted) ? wanted : result.launch.data.step, result.created ? { bravo: 'produit' } : {}));
}

/** « Étape suivante » : l'étape est validée, le statut du dashboard suit, et on passe à la suivante. */
export async function nextStepAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const launch = await getLaunch(repo, profile.id, String(formData.get('id') ?? ''));
  const step = String(formData.get('etape') ?? '');
  if (!launch || !isLaunchStep(step)) redirect('/app/lancer');
  const data = completeStep(launch.data, step);
  await saveLaunch(repo, profile.id, launch, data);
  const board = (await listBoards(repo, profile.id)).get(data.product_id)?.data ?? null;
  await syncLaunchStage(repo, profile.id, data, board, parisDate());
  refresh(launch.id);
  redirect(launchHref(launch.id, data.step, { bravo: step }));
}

/** Terminé ou abandonné : le lancement quitte les produits en cours et reste dans l'historique. */
export async function closeLaunchAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const launch = await getLaunch(repo, profile.id, String(formData.get('id') ?? ''));
  const state = String(formData.get('etat') ?? '');
  if (!launch || (state !== 'termine' && state !== 'abandonne')) redirect('/app/lancer');
  await closeLaunch(repo, profile.id, launch, state, parisDate());
  refresh(launch.id);
  redirect(`/app/lancer?ferme=${state}#historique`);
}

/** Rouvre un lancement de l'historique (le produit revient dans les produits en cours). */
export async function reopenLaunchAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const launch = await getLaunch(repo, profile.id, String(formData.get('id') ?? ''));
  if (!launch) redirect('/app/lancer');
  if (!(await reopenLaunch(repo, profile, launch, parisDate()))) redirect('/app/lancer?lancement=limite#historique');
  refresh(launch.id);
  redirect(launchHref(launch.id, launch.data.step));
}
