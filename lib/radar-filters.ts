import type { Product, Trend } from '@/lib/db/types';
import { isNicheId, type NicheId } from '@/lib/niches';
import { BADGE_IDS, badgesFor, type BadgeId } from '@/lib/radar/badges';
import { NEW_PRODUCT_DAYS, productMetrics, type ProductMetrics } from '@/lib/radar/metrics';

/**
 * Filtres du radar : module pur, utilisable côté client comme côté serveur.
 *
 * Règle des données manquantes : un produit dont la source ne donne pas la donnée filtrée est écarté (on ne peut pas
 * dire qu'il remplit le critère), et un filtre dont aucun produit du jour n'a la donnée n'est pas proposé
 * (`filterAvailability`).
 */

export type PriceBucket = 'moins15' | '15-30' | '30-60' | 'plus60';

export interface RadarFilters {
  niche?: NicheId;
  /** Sous-catégorie TikTok Shop (deuxième niveau du chemin de catégorie). */
  souscat?: string;
  prix?: PriceBucket;
  /** Prix minimum et maximum, en euros. */
  prixMin?: number;
  prixMax?: number;
  /** Taux de commission minimum, en pour cent (ex. 15). */
  commission?: number;
  /** Commission minimum par vente, en euros. */
  commissionEuros?: number;
  /** Ventes minimum sur 7 et sur 30 jours. */
  ventes7?: number;
  ventes30?: number;
  /** Croissance minimum sur 7 jours, en pour cent (ex. 20 = +20 %). */
  croissance?: number;
  affiliesMin?: number;
  affiliesMax?: number;
  /** Note minimum (sur 5). */
  note?: number;
  /** Nombre d'avis minimum. */
  avis?: number;
  /** Vu pour la première fois par la source il y a moins de 30 jours. */
  nouveau?: boolean;
  tendance?: Exclude<Trend, 'baisse'>;
  badge?: BadgeId;
}

export const PRICE_BUCKETS: Array<{ id: PriceBucket; label: string; min: number; max: number }> = [
  { id: 'moins15', label: 'Moins de 15 €', min: 0, max: 1499 },
  { id: '15-30', label: '15 à 30 €', min: 1500, max: 3000 },
  { id: '30-60', label: '30 à 60 €', min: 3001, max: 6000 },
  { id: 'plus60', label: 'Plus de 60 €', min: 6001, max: Number.POSITIVE_INFINITY },
];

export const COMMISSION_STEPS = [10, 15, 20, 25];
export const RATING_STEPS = [3.5, 4, 4.5];

/** Nom du paramètre d'adresse de chaque filtre (court, en français). */
export const FILTER_PARAMS: Record<keyof RadarFilters, string> = {
  niche: 'niche',
  souscat: 'souscat',
  prix: 'prix',
  prixMin: 'prixmin',
  prixMax: 'prixmax',
  commission: 'commission',
  commissionEuros: 'comeur',
  ventes7: 'v7',
  ventes30: 'v30',
  croissance: 'croissance',
  affiliesMin: 'affmin',
  affiliesMax: 'affmax',
  note: 'note',
  avis: 'avis',
  nouveau: 'nouveau',
  tendance: 'tendance',
  badge: 'badge',
};

type Params = Record<string, string | string[] | undefined>;

/** Nombre décimal (« 12,5 » accepté) dans les bornes, sinon undefined. */
function numberParam(raw: string | undefined, min: number, max: number): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw.replace(',', '.').trim());
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return Math.round(n * 100) / 100;
}

export function parseFilters(params: Params): RadarFilters {
  const get = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const filters: RadarFilters = {};
  const niche = get('niche');
  if (isNicheId(niche)) filters.niche = niche;
  const souscat = get('souscat')?.trim();
  if (souscat && souscat.length <= 80) filters.souscat = souscat;
  const prix = get('prix');
  if (PRICE_BUCKETS.some((b) => b.id === prix)) filters.prix = prix as PriceBucket;
  const numbers: Array<[keyof RadarFilters, number, number]> = [
    ['prixMin', 0, 10_000],
    ['prixMax', 0, 10_000],
    ['commissionEuros', 0, 1_000],
    ['ventes7', 0, 10_000_000],
    ['ventes30', 0, 10_000_000],
    ['croissance', -100, 500],
    ['affiliesMin', 0, 10_000_000],
    ['affiliesMax', 0, 10_000_000],
    ['avis', 0, 10_000_000],
  ];
  for (const [key, min, max] of numbers) {
    const value = numberParam(get(FILTER_PARAMS[key]), min, max);
    if (value !== undefined) (filters as Record<string, unknown>)[key] = value;
  }
  const commission = Number(get('commission'));
  if (COMMISSION_STEPS.includes(commission)) filters.commission = commission;
  const note = Number(get('note')?.replace(',', '.'));
  if (RATING_STEPS.includes(note)) filters.note = note;
  if (get('nouveau') === '1') filters.nouveau = true;
  const tendance = get('tendance');
  if (tendance === 'explose' || tendance === 'monte' || tendance === 'stable') filters.tendance = tendance;
  const badge = get('badge');
  if ((BADGE_IDS as string[]).includes(badge ?? '')) filters.badge = badge as BadgeId;
  return filters;
}

/** Filtres → paramètres d'adresse (pour les liens, l'export et les alertes). */
export function filtersToParams(filters: RadarFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, param] of Object.entries(FILTER_PARAMS) as Array<[keyof RadarFilters, string]>) {
    const value = filters[key];
    if (value === undefined || value === false) continue;
    params.set(param, value === true ? '1' : String(value));
  }
  return params;
}

export function hasFilters(filters: RadarFilters): boolean {
  return Object.keys(filters).length > 0;
}

/** Un produit avec ses chiffres et ses badges, prêt à filtrer. */
export interface FilterTarget {
  product: Product;
  metrics: ProductMetrics;
  badges: BadgeId[];
}

export function filterTarget(product: Product): FilterTarget {
  const metrics = productMetrics(product);
  return { product, metrics, badges: badgesFor(metrics) };
}

const atLeast = (value: number | null, min: number | undefined) => min === undefined || (value !== null && value >= min - 1e-9);
const atMost = (value: number | null, max: number | undefined) => max === undefined || (value !== null && value <= max + 1e-9);

export function matchesFilters({ product: p, metrics: m, badges }: FilterTarget, filters: RadarFilters): boolean {
  const bucket = PRICE_BUCKETS.find((b) => b.id === filters.prix);
  if (filters.niche && p.niche !== filters.niche) return false;
  if (filters.souscat && m.subcategory?.toLowerCase() !== filters.souscat.toLowerCase()) return false;
  if (bucket && (p.price_cents < bucket.min || p.price_cents > bucket.max)) return false;
  if (!atLeast(p.price_cents / 100, filters.prixMin) || !atMost(p.price_cents / 100, filters.prixMax)) return false;
  if (filters.commission && p.commission_rate * 100 < filters.commission - 0.001) return false;
  if (!atLeast(m.commission_cents / 100, filters.commissionEuros)) return false;
  if (!atLeast(m.sales_7d, filters.ventes7) || !atLeast(m.sales_30d, filters.ventes30)) return false;
  if (!atLeast(m.growth_7d === null ? null : m.growth_7d * 100, filters.croissance)) return false;
  if (!atLeast(m.affiliates, filters.affiliesMin) || !atMost(m.affiliates, filters.affiliesMax)) return false;
  if (!atLeast(m.rating, filters.note) || !atLeast(m.review_count, filters.avis)) return false;
  if (filters.nouveau && !(m.age_days !== null && m.age_days < NEW_PRODUCT_DAYS)) return false;
  if (filters.tendance && p.trend !== filters.tendance) return false;
  if (filters.badge && !badges.includes(filters.badge)) return false;
  return true;
}

export function applyFilters(products: Product[], filters: RadarFilters): Product[] {
  if (!hasFilters(filters)) return products;
  return products.filter((p) => matchesFilters(filterTarget(p), filters));
}

/** Filtres proposés : seulement ceux dont au moins un produit du jour a la donnée. */
export interface FilterAvailability {
  subcategories: string[];
  sales7: boolean;
  sales30: boolean;
  growth: boolean;
  affiliates: boolean;
  rating: boolean;
  reviews: boolean;
  newProducts: boolean;
  badges: BadgeId[];
}

export function filterAvailability(targets: FilterTarget[]): FilterAvailability {
  const subcategories = [...new Set(targets.map((t) => t.metrics.subcategory).filter((s): s is string => Boolean(s)))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
  const some = (pick: (m: ProductMetrics) => unknown) => targets.some((t) => pick(t.metrics) !== null && pick(t.metrics) !== undefined);
  return {
    subcategories,
    sales7: some((m) => m.sales_7d),
    sales30: some((m) => m.sales_30d),
    growth: some((m) => m.growth_7d),
    affiliates: some((m) => m.affiliates),
    rating: some((m) => m.rating),
    reviews: some((m) => m.review_count),
    newProducts: some((m) => m.age_days),
    badges: BADGE_IDS.filter((id) => targets.some((t) => t.badges.includes(id))),
  };
}

/** Résumé lisible des filtres (alertes, export, e-mails). */
export function describeFilters(filters: RadarFilters, labels: { niche?: (id: NicheId) => string; badge?: (id: BadgeId) => string } = {}): string[] {
  const out: string[] = [];
  const euros = (n: number) => `${String(n).replace('.', ',')} €`;
  if (filters.niche) out.push(labels.niche ? labels.niche(filters.niche) : filters.niche);
  if (filters.souscat) out.push(`sous-catégorie ${filters.souscat}`);
  const bucket = PRICE_BUCKETS.find((b) => b.id === filters.prix);
  if (bucket) out.push(bucket.label.toLowerCase());
  if (filters.prixMin !== undefined) out.push(`prix dès ${euros(filters.prixMin)}`);
  if (filters.prixMax !== undefined) out.push(`prix jusqu’à ${euros(filters.prixMax)}`);
  if (filters.commission) out.push(`commission ${filters.commission} % et plus`);
  if (filters.commissionEuros !== undefined) out.push(`${euros(filters.commissionEuros)} et plus par vente`);
  if (filters.ventes7 !== undefined) out.push(`${filters.ventes7} ventes et plus sur 7 jours`);
  if (filters.ventes30 !== undefined) out.push(`${filters.ventes30} ventes et plus sur 30 jours`);
  if (filters.croissance !== undefined) out.push(`croissance de ${filters.croissance > 0 ? '+' : ''}${filters.croissance} % et plus`);
  if (filters.affiliesMin !== undefined) out.push(`${filters.affiliesMin} affiliés et plus`);
  if (filters.affiliesMax !== undefined) out.push(`${filters.affiliesMax} affiliés au plus`);
  if (filters.note !== undefined) out.push(`note de ${String(filters.note).replace('.', ',')} et plus`);
  if (filters.avis !== undefined) out.push(`${filters.avis} avis et plus`);
  if (filters.nouveau) out.push(`nouveaux (moins de ${NEW_PRODUCT_DAYS} jours)`);
  if (filters.tendance) out.push(`tendance « ${filters.tendance} »`);
  if (filters.badge) out.push(labels.badge ? `badge « ${labels.badge(filters.badge)} »` : filters.badge);
  return out;
}
