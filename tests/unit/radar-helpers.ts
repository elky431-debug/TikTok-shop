import type { Product, ProductDetails, ScoreBreakdown, ScorePart } from '@/lib/db/types';
import type { NicheId } from '@/lib/niches';
import { WEIGHTS } from '@/lib/score';
import { parisDate } from '@/lib/utils';

/** Produits fabriqués pour les tests du radar (session 5, blocs 1 à 3). */
export const TODAY = parisDate();
export const NOW = new Date().toISOString();

export function breakdown(
  values: Partial<Record<ScorePart['key'], number | null>> = {},
  extra: Partial<Pick<ScoreBreakdown, 'growth_7d' | 'daily_sales_7d'>> = {},
): ScoreBreakdown {
  const v = { croissance: 0.5, commission: 0.5, saturation: 0.5, prix: 1, ...values };
  const parts: ScorePart[] = (Object.keys(WEIGHTS) as Array<ScorePart['key']>).map((key) => ({
    key,
    label: key,
    weight: WEIGHTS[key],
    available: v[key] !== null,
    applied_weight: WEIGHTS[key],
    value: v[key] ?? 0,
    points: (v[key] ?? 0) * WEIGHTS[key],
    sentence: `Phrase ${key}.`,
  }));
  return {
    total: 50,
    raw: 50,
    parts,
    growth_7d: extra.growth_7d === undefined ? 0.2 : extra.growth_7d,
    daily_sales_7d: extra.daily_sales_7d === undefined ? 30 : extra.daily_sales_7d,
    summary: 'Résumé.',
  };
}

export function details(over: Partial<ProductDetails> = {}): ProductDetails {
  return {
    sales: { d1: null, d7: null, d15: null, d30: null, d60: null, d90: null },
    first_seen: null,
    rating: null,
    review_count: null,
    fetched_at: NOW,
    ...over,
  };
}

export function product(id: string, over: Partial<Product> = {}): Product {
  return {
    id,
    provider: 'nexscope',
    name: `Produit ${id}`,
    niche: 'beaute' as NicheId,
    description: 'Catégorie TikTok Shop : Beauty & Personal Care › Skincare › Toners',
    shop_name: 'Boutique A',
    price_cents: 2000,
    commission_rate: 0.15,
    active_affiliates: 10,
    image_url: '',
    top_videos: [],
    videos_fetched_at: null,
    details: null,
    region: 'FR',
    snapshot_date: TODAY,
    latest_score: 50,
    latest_breakdown: breakdown(),
    trend: 'monte',
    growth_7d: 0.2,
    sales_30d: [30],
    updated_at: NOW,
    ...over,
  };
}
