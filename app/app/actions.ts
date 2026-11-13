'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { filtersToParams, parseFilters } from '@/lib/radar-filters';
import { runKeywordSearch } from '@/lib/radar/keyword-search';
import { sanitizeWeights, WEIGHT_PRESETS } from '@/lib/radar/personal';
import { saveRadarSettings, toggleFavorite } from '@/lib/radar/settings';
import { defaultOrder, isRadarView, isSortKey, isSortOrder } from '@/lib/radar/sort';

/**
 * Actions du radar : réglages mémorisés (vue, tri, poids), favoris, recherche par mot-clé. Chaque action revérifie la
 * session et le plan côté serveur ; les adresses de retour sont reconstruites (jamais suivies telles quelles).
 */

/** Adresse du radar avec ses filtres, reconstruite à partir des seuls filtres connus. */
function radarUrl(query: FormDataEntryValue | null): string {
  const params = filtersToParams(parseFilters(Object.fromEntries(new URLSearchParams(String(query ?? '')))));
  const text = params.toString();
  return text ? `/app/radar?${text}` : '/app/radar';
}

/** Retour vers une page de l'appli seulement (pas d'adresse externe). */
function appPath(value: FormDataEntryValue | null, fallback = '/app'): string {
  const path = String(value ?? '');
  return /^\/app(\/[\w\-./%]*)?(\?[\w\-=&%.,+:]*)?(#[\w-]*)?$/.test(path) && !path.includes('//') ? path : fallback;
}

export async function saveRadarPrefsAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer();
  const patch: Parameters<typeof saveRadarSettings>[1] = {};
  const vue = formData.get('vue');
  if (isRadarView(vue)) patch.vue = vue;
  // « prix:asc » (en-tête de colonne) ou « prix » + « ordre ».
  const [tri, sens] = String(formData.get('tri') ?? '').split(':');
  if (isSortKey(tri)) {
    patch.tri = tri;
    const ordre = sens ?? formData.get('ordre');
    patch.ordre = isSortOrder(ordre) ? ordre : defaultOrder(tri);
  }
  await saveRadarSettings(profile.id, patch);
  redirect(radarUrl(formData.get('retour')));
}

export async function saveWeightsAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer();
  if (!getPlan(profile.plan).customWeights) redirect('/app/passer-pro');
  const choice = String(formData.get('reglage') ?? '');
  if (choice === 'defaut') {
    await saveRadarSettings(profile.id, { poids: null });
  } else {
    const preset = WEIGHT_PRESETS[choice as keyof typeof WEIGHT_PRESETS];
    const weights = preset ? preset.weights : sanitizeWeights(Object.fromEntries(formData.entries()));
    if (!weights) redirect(`${radarUrl(formData.get('retour'))}#poids`);
    await saveRadarSettings(profile.id, { poids: weights });
  }
  revalidatePath('/app');
  redirect(radarUrl(formData.get('retour')));
}

export async function toggleFavoriteAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer();
  const productId = String(formData.get('produit') ?? '');
  if (productId && (await getRepo().getProduct(productId))) await toggleFavorite(profile.id, productId);
  revalidatePath('/app');
  revalidatePath('/app/comparer');
  redirect(appPath(formData.get('retour')));
}

export async function searchKeywordAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/recherche');
  const result = await runKeywordSearch(profile, formData.get('q'));
  if (!result.ok) {
    if (result.reason === 'plan') redirect('/app/passer-pro');
    redirect(`/app/recherche?erreur=${result.reason}`);
  }
  revalidatePath('/app/recherche');
  redirect(`/app/recherche?id=${encodeURIComponent(result.id)}`);
}
