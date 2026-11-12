import type { Product, Trend } from '@/lib/db/types';
import { isNicheId, type NicheId } from '@/lib/niches';

/** Filtres du radar : module pur, utilisable côté client comme côté serveur. */

export type PriceBucket = 'moins15' | '15-30' | '30-60' | 'plus60';

export interface RadarFilters {
  niche?: NicheId;
  prix?: PriceBucket;
  commission?: number; // pourcentage minimum, ex. 15
  tendance?: Exclude<Trend, 'baisse'>;
}

export const PRICE_BUCKETS: Array<{ id: PriceBucket; label: string; min: number; max: number }> = [
  { id: 'moins15', label: 'Moins de 15 €', min: 0, max: 1499 },
  { id: '15-30', label: '15 à 30 €', min: 1500, max: 3000 },
  { id: '30-60', label: '30 à 60 €', min: 3001, max: 6000 },
  { id: 'plus60', label: 'Plus de 60 €', min: 6001, max: Number.POSITIVE_INFINITY },
];

export const COMMISSION_STEPS = [10, 15, 20, 25];

export function parseFilters(params: Record<string, string | string[] | undefined>): RadarFilters {
  const get = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const filters: RadarFilters = {};
  const niche = get('niche');
  if (isNicheId(niche)) filters.niche = niche;
  const prix = get('prix');
  if (PRICE_BUCKETS.some((b) => b.id === prix)) filters.prix = prix as PriceBucket;
  const commission = Number(get('commission'));
  if (COMMISSION_STEPS.includes(commission)) filters.commission = commission;
  const tendance = get('tendance');
  if (tendance === 'explose' || tendance === 'monte' || tendance === 'stable') filters.tendance = tendance;
  return filters;
}

export function hasFilters(filters: RadarFilters): boolean {
  return Object.keys(filters).length > 0;
}

export function applyFilters(products: Product[], filters: RadarFilters): Product[] {
  const bucket = PRICE_BUCKETS.find((b) => b.id === filters.prix);
  return products.filter((p) => {
    if (filters.niche && p.niche !== filters.niche) return false;
    if (bucket && (p.price_cents < bucket.min || p.price_cents > bucket.max)) return false;
    if (filters.commission && p.commission_rate * 100 < filters.commission - 0.001) return false;
    if (filters.tendance && p.trend !== filters.tendance) return false;
    return true;
  });
}
