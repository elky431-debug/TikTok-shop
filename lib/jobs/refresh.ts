import { getProvider, type ProductDataProvider, type ProviderProduct } from '@/lib/data';
import { getRepo, type Repo } from '@/lib/db';
import type { Product, ProductSnapshot, ScoreBreakdown, TopVideo } from '@/lib/db/types';
import { scoreProducts, trendFor, type ScoreInput } from '@/lib/score';
import { addDays, dateRange, parisDate } from '@/lib/utils';
import { mapWithConcurrency } from './concurrency';

export interface RefreshOptions {
  date?: string;
  repo?: Repo;
  provider?: ProductDataProvider;
  /** Nombre de jours d'instantanés à (re)calculer, en remontant depuis `date`. 1 = seulement le jour. */
  backfillDays?: number;
}

export interface RefreshResult {
  date: string;
  provider: string;
  products: number;
  snapshots: number;
  durationMs: number;
}

const HISTORY_DAYS = 30;
const GROWTH_WINDOW = 14;

/**
 * Étapes 1 à 3 de la tâche nocturne : récupère les produits du jour, enregistre l'instantané
 * quotidien et calcule le score d'opportunité. Avec `backfillDays`, recalcule aussi les jours passés
 * (utilisé par le seed pour remplir 30 jours d'historique).
 */
export async function refreshCatalog(options: RefreshOptions = {}): Promise<RefreshResult> {
  const started = Date.now();
  const date = options.date ?? parisDate();
  const repo = options.repo ?? getRepo();
  const provider = options.provider ?? getProvider();
  const backfillDays = Math.max(1, options.backfillDays ?? 1);

  const products = await provider.fetchTrendingProducts({ country: 'FR', date });
  const totalDays = HISTORY_DAYS + GROWTH_WINDOW + backfillDays;

  // Historique complet par produit (fournisseur, ou nos propres instantanés s'il n'en donne pas).
  const histories = await mapWithConcurrency(products, 8, async (p) => {
    const history = await provider.fetchProductHistory(p.id, totalDays, date);
    if (history.length) return history;
    const own = await repo.getProductSnapshots(p.id, totalDays - 1);
    return [
      ...own.map((s) => ({ date: s.date, estimated_sales: s.estimated_sales, affiliates: s.affiliates })),
      { date, estimated_sales: p.estimated_sales, affiliates: p.active_affiliates },
    ];
  });

  const days = dateRange(date, backfillDays);
  const snapshots: ProductSnapshot[] = [];
  let todayScores = new Map<string, ScoreBreakdown>();

  for (const day of days) {
    const points = histories.map((history) => history.filter((h) => h.date <= day));
    const inputs: ScoreInput[] = products.map((p, i) => ({
      id: p.id,
      niche: p.niche,
      price_cents: p.price_cents,
      commission_rate: p.commission_rate,
      free_sample: p.free_sample,
      affiliates: points[i].at(-1)?.affiliates ?? p.active_affiliates,
      sales: points[i].slice(-GROWTH_WINDOW).map((h) => h.estimated_sales),
    }));
    const scores = scoreProducts(inputs);
    inputs.forEach((input, i) => {
      const breakdown = scores.get(input.id)!;
      snapshots.push({
        product_id: input.id,
        date: day,
        estimated_sales: points[i].at(-1)?.estimated_sales ?? 0,
        affiliates: input.affiliates,
        score: breakdown.total,
        score_breakdown: breakdown,
        trend: trendFor(breakdown.growth_7d),
      });
    });
    if (day === date) todayScores = scores;
  }

  // Vidéos de référence : tous les produits pour le mock, seulement les mieux notés sinon (coût API).
  const ranked = [...products].sort((a, b) => (todayScores.get(b.id)?.total ?? 0) - (todayScores.get(a.id)?.total ?? 0));
  const videoTargets = new Set((provider.name === 'mock' ? ranked : ranked.slice(0, 60)).map((p) => p.id));
  const existing = new Map((await repo.getProducts(products.map((p) => p.id))).map((p) => [p.id, p]));
  const videos = new Map<string, TopVideo[]>();
  await mapWithConcurrency([...videoTargets], 6, async (id) => {
    try {
      videos.set(id, await provider.fetchTopVideos(id));
    } catch {
      videos.set(id, existing.get(id)?.top_videos ?? []);
    }
  });

  const nowIso = new Date().toISOString();
  const rows: Product[] = products.map((p: ProviderProduct, i) => {
    const breakdown = todayScores.get(p.id)!;
    const salesWindow = histories[i].filter((h) => h.date <= date && h.date > addDays(date, -HISTORY_DAYS));
    return {
      id: p.id,
      provider: provider.name,
      name: p.name,
      niche: p.niche,
      description: p.description,
      shop_name: p.shop_name,
      price_cents: p.price_cents,
      commission_rate: p.commission_rate,
      free_sample: p.free_sample,
      active_affiliates: p.active_affiliates,
      image_url: p.image_url,
      top_videos: videos.get(p.id) ?? existing.get(p.id)?.top_videos ?? [],
      snapshot_date: date,
      latest_score: breakdown.total,
      latest_breakdown: breakdown,
      trend: trendFor(breakdown.growth_7d),
      growth_7d: breakdown.growth_7d,
      sales_30d: salesWindow.map((h) => h.estimated_sales),
      updated_at: nowIso,
    };
  });

  await repo.upsertProducts(rows);
  await repo.upsertSnapshots(snapshots);

  return {
    date,
    provider: provider.name,
    products: rows.length,
    snapshots: snapshots.length,
    durationMs: Date.now() - started,
  };
}
