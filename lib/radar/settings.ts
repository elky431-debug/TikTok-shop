import { getRepo, type Repo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { getPlan } from '@/lib/plans';
import { isDefaultWeights, sanitizeWeights, type Weights } from './personal';
import { defaultOrder, isRadarView, isSortKey, isSortOrder, type RadarView, type SortKey, type SortOrder } from './sort';

/**
 * Réglages du radar mémorisés par utilisateur (une fiche `radar_reglages`) : vue, tri, sens, poids du score.
 * Favoris (une fiche `favoris`) : produits mis de côté pour les comparer.
 */
export const SETTINGS_KIND = 'radar_reglages';
export const FAVORITES_KIND = 'favoris';
export const MAX_FAVORITES = 50;

export interface RadarSettings {
  vue: RadarView;
  tri: SortKey;
  ordre: SortOrder;
  /** Poids réglés (Elite) ; null = réglage par défaut. */
  poids: Weights | null;
}

export const DEFAULT_SETTINGS: RadarSettings = { vue: 'cartes', tri: 'score', ordre: 'desc', poids: null };

function clean(raw: Partial<RadarSettings> | null | undefined): RadarSettings {
  const { vue, tri, ordre, poids } = raw ?? {};
  const sort = isSortKey(tri) ? tri : DEFAULT_SETTINGS.tri;
  return {
    vue: isRadarView(vue) ? vue : DEFAULT_SETTINGS.vue,
    tri: sort,
    ordre: isSortOrder(ordre) ? ordre : defaultOrder(sort),
    poids: poids ? sanitizeWeights(poids) : null,
  };
}

export async function getRadarSettings(userId: string, repo: Repo = getRepo()): Promise<RadarSettings> {
  const [record] = await repo.listRecords<RadarSettings>(userId, SETTINGS_KIND);
  return clean(record?.data);
}

export async function saveRadarSettings(userId: string, patch: Partial<RadarSettings>, repo: Repo = getRepo()): Promise<RadarSettings> {
  const [record] = await repo.listRecords<RadarSettings>(userId, SETTINGS_KIND);
  // Nouvelle colonne sans sens précisé : son sens naturel (prix croissant, ventes décroissantes…).
  const order = patch.tri && !patch.ordre ? { ordre: defaultOrder(patch.tri) } : {};
  const next = clean({ ...clean(record?.data), ...patch, ...order });
  if (next.poids && isDefaultWeights(next.poids)) next.poids = null;
  await repo.saveRecord(userId, SETTINGS_KIND, next, record?.id);
  return next;
}

/** Poids appliqués : seulement en Elite (vérifié côté serveur), sinon le réglage par défaut. */
export function effectiveWeights(profile: Pick<Profile, 'plan'>, settings: RadarSettings): Weights | null {
  return getPlan(profile.plan).customWeights && settings.poids && !isDefaultWeights(settings.poids) ? settings.poids : null;
}

export async function getFavorites(userId: string, repo: Repo = getRepo()): Promise<string[]> {
  const [record] = await repo.listRecords<{ ids: string[] }>(userId, FAVORITES_KIND);
  return Array.isArray(record?.data?.ids) ? record.data.ids.filter((id) => typeof id === 'string') : [];
}

/** Ajoute ou retire un favori ; renvoie le nouvel état (true = en favori). */
export async function toggleFavorite(userId: string, productId: string, repo: Repo = getRepo()): Promise<boolean> {
  const [record] = await repo.listRecords<{ ids: string[] }>(userId, FAVORITES_KIND);
  const ids = Array.isArray(record?.data?.ids) ? record.data.ids : [];
  const present = ids.includes(productId);
  const next = present ? ids.filter((id) => id !== productId) : [productId, ...ids].slice(0, MAX_FAVORITES);
  await repo.saveRecord(userId, FAVORITES_KIND, { ids: next }, record?.id);
  return !present;
}
