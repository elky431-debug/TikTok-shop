import type { Product } from '@/lib/db/types';
import { commissionPerSale } from '@/lib/score';
import { daysBetween, parisDate } from '@/lib/utils';

/**
 * Chiffres d'un produit, lus uniquement dans ce que la source a donné (module pur, utilisable côté client).
 * Une donnée absente reste `null` : les filtres, les badges et les colonnes qui en dépendent se masquent.
 *
 * Priorités (documentées dans docs/session5/blocs1-2-3.md, B3) :
 *  - ventes sur 7 jours : nos relevés quotidiens (7 jours ou plus), sinon la moyenne quotidienne qui sert au score
 *    (cumuls de la source), sinon les ventes par période de la source ;
 *  - ventes sur 30 jours : nos relevés (30 jours), sinon les ventes par période de la source ;
 *  - rythmes de ventes (badges) : nos relevés s'il y en a 14 jours, sinon les ventes par période de la source.
 */

/** « Catégorie TikTok Shop : A › B › C » (écrit par l'adaptateur Nexscope dans la description). */
const CATEGORY_LINE = /Catégorie TikTok Shop : ([^\n]+)/;

export function categoryPath(description: string | null | undefined): string[] {
  const match = CATEGORY_LINE.exec(description ?? '');
  if (!match) return [];
  return match[1]
    .split('›')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Sous-catégorie = deuxième niveau du chemin TikTok Shop (« Skincare » dans « Beauty & Personal Care › Skincare »). */
export function subcategoryOf(path: string[]): string | null {
  return path[1] ?? null;
}

/** Produit « nouveau » : vu pour la première fois par la source il y a moins de 30 jours. */
export const NEW_PRODUCT_DAYS = 30;
/** Jours de relevés quotidiens nécessaires pour mesurer les rythmes de ventes sans la source. */
export const MIN_DAYS_FOR_PACE = 14;

export interface SalesPace {
  /** Ventes par jour sur les tout derniers jours (3 jours de relevés, ou le dernier jour de la source). */
  recent: number | null;
  /** Ventes par jour sur 7 jours. */
  week: number | null;
  /** Ventes par jour sur 30 jours (ou depuis l'arrivée du produit, s'il y a au moins 14 jours). */
  month: number | null;
}

export interface ProductMetrics {
  price_cents: number;
  commission_rate: number;
  commission_cents: number;
  sales_7d: number | null;
  sales_30d: number | null;
  /** Ventes moyennes par jour sur 7 jours. */
  daily_sales: number | null;
  growth_7d: number | null;
  affiliates: number | null;
  rating: number | null;
  review_count: number | null;
  /** Premier relevé du produit chez la source (AAAA-MM-JJ). */
  first_seen: string | null;
  /** Jours depuis ce premier relevé, au jour du relevé du produit. */
  age_days: number | null;
  category: string[];
  subcategory: string | null;
  pace: SalesPace;
}

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);
const avg = (values: number[]) => (values.length ? sum(values) / values.length : null);

export function productMetrics(product: Product, today: string = product.snapshot_date ?? parisDate()): ProductMetrics {
  const series = product.sales_30d ?? [];
  const details = product.details;
  const breakdown = product.latest_breakdown;
  const daily = breakdown?.daily_sales_7d ?? null;

  let sales7: number | null = null;
  if (series.length >= 7) sales7 = sum(series.slice(-7));
  else if (daily !== null) sales7 = Math.round(daily * 7);
  else if (details?.sales.d7 != null) sales7 = details.sales.d7;

  let sales30: number | null = null;
  if (series.length >= 30) sales30 = sum(series.slice(-30));
  else if (details?.sales.d30 != null) sales30 = details.sales.d30;
  // Deux sources qui se contredisent (30 jours < 7 jours) : on ne garde pas le chiffre le moins sûr.
  if (sales30 !== null && sales7 !== null && sales30 < sales7) sales30 = null;

  const firstSeen = details?.first_seen ?? null;
  const age = firstSeen ? Math.max(0, daysBetween(firstSeen, today)) : null;

  const pace: SalesPace = { recent: null, week: null, month: null };
  if (series.length >= MIN_DAYS_FOR_PACE) {
    pace.recent = avg(series.slice(-3));
    pace.week = avg(series.slice(-7));
    pace.month = avg(series.slice(-30));
  } else if (details) {
    const covered = age === null ? 30 : Math.min(30, age + 1);
    pace.recent = details.sales.d1;
    pace.week = details.sales.d7 != null ? details.sales.d7 / 7 : null;
    pace.month = details.sales.d30 != null && covered >= MIN_DAYS_FOR_PACE ? details.sales.d30 / covered : null;
  }

  const category = categoryPath(product.description);
  return {
    price_cents: product.price_cents,
    commission_rate: product.commission_rate,
    commission_cents: commissionPerSale(product.price_cents, product.commission_rate),
    sales_7d: sales7,
    sales_30d: sales30,
    daily_sales: daily ?? (sales7 !== null ? sales7 / 7 : null),
    growth_7d: breakdown ? breakdown.growth_7d : null,
    affiliates: product.active_affiliates,
    rating: details?.rating ?? null,
    review_count: details?.review_count ?? null,
    first_seen: firstSeen,
    age_days: age,
    category,
    subcategory: subcategoryOf(category),
    pace,
  };
}
