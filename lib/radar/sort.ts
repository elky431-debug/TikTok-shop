/** Tri du radar (module pur) : n'importe quelle colonne, croissant ou décroissant ; une valeur inconnue va toujours en bas. */
export const SORT_KEYS = [
  'score',
  'pourtoi',
  'prix',
  'commission',
  'comeur',
  'ventes7',
  'ventes30',
  'croissance',
  'affilies',
  'note',
  'avis',
  'nouveaute',
  'nom',
] as const;

export type SortKey = (typeof SORT_KEYS)[number];
export type SortOrder = 'asc' | 'desc';
export type RadarView = 'cartes' | 'liste';

export const SORT_LABELS: Record<SortKey, string> = {
  score: 'Score',
  pourtoi: 'Score pour toi',
  prix: 'Prix',
  commission: 'Commission (%)',
  comeur: 'Commission par vente',
  ventes7: 'Ventes 7 jours',
  ventes30: 'Ventes 30 jours',
  croissance: 'Croissance',
  affilies: 'Affiliés',
  note: 'Note',
  avis: 'Avis',
  nouveaute: 'Nouveauté',
  nom: 'Nom',
};

/** Colonnes qui demandent le score (masquées sans abonnement ; « pour toi » à partir de Pro). */
export const SCORE_SORTS: SortKey[] = ['score', 'pourtoi'];

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value);
}

export function isSortOrder(value: unknown): value is SortOrder {
  return value === 'asc' || value === 'desc';
}

export function isRadarView(value: unknown): value is RadarView {
  return value === 'cartes' || value === 'liste';
}

/** Sens naturel d'une colonne : alphabétique pour le nom, prix croissant, le reste du plus grand au plus petit. */
export function defaultOrder(key: SortKey): SortOrder {
  return key === 'nom' || key === 'prix' ? 'asc' : 'desc';
}

/**
 * Trie une copie de la liste. `value` renvoie la valeur de la colonne (null = inconnue, toujours en dernier) ; à
 * égalité, l'ordre d'arrivée est gardé (le classement par score).
 */
export function sortBy<T>(items: T[], order: SortOrder, value: (item: T) => number | string | null): T[] {
  const sign = order === 'asc' ? 1 : -1;
  return items
    .map((item, index) => ({ item, index, v: value(item) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.index - b.index;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const diff = typeof a.v === 'string' && typeof b.v === 'string' ? a.v.localeCompare(b.v, 'fr') : Number(a.v) - Number(b.v);
      return diff === 0 ? a.index - b.index : sign * diff;
    })
    .map((x) => x.item);
}
