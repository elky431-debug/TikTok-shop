import { getProvider, type ProductDataProvider, type ProviderProduct, type ProviderRunStats } from '@/lib/data';
import type { SalesPoint } from '@/lib/data/provider';
import { getRepo, type Repo } from '@/lib/db';
import type { Product, ProductDetails, ProductSnapshot, ScoreBreakdown, TopVideo } from '@/lib/db/types';
import { env } from '@/lib/env';
import { scoreProducts, trendOf, type ScoreInput } from '@/lib/score';
import { addDays, dateRange, daysBetween, parisDate } from '@/lib/utils';
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
  /** Compteurs du fournisseur réel (appels, cache, reprises, quota, produits écartés, images refusées). */
  stats?: ProviderRunStats;
  /** Vidéos chargées cette nuit, et produits dont les ventes par période ont été lues. */
  videos?: number;
  details?: number;
}

/** Vidéos : on ne redemande rien à la source pendant 3 jours. */
export const VIDEO_CACHE_DAYS = 3;
/** En dessous de 7 jours de relevés, la fiche montre les ventes par période de la source au lieu de la courbe. */
export const MIN_DAYS_FOR_CURVE = 7;

export function videosAreFresh(fetchedAt: string | null | undefined, now = new Date()): boolean {
  return Boolean(fetchedAt) && now.getTime() - new Date(fetchedAt!).getTime() < VIDEO_CACHE_DAYS * 86_400_000;
}

const HISTORY_DAYS = 30;
const GROWTH_WINDOW = 14;

type Point = SalesPoint & { units_sold_total: number | null };

/**
 * Série quotidienne d'un produit : l'historique du fournisseur s'il en donne un, sinon nos instantanés des nuits
 * précédentes plus le relevé du jour. Quand la source ne donne qu'un cumul de ventes, les ventes du jour sont la
 * différence avec le cumul du dernier relevé (réparties sur les jours écoulés) ; le premier jour, elles restent
 * inconnues.
 */
async function seriesFor(p: ProviderProduct, provider: ProductDataProvider, repo: Repo, date: string, days: number): Promise<Point[]> {
  const history = await provider.fetchProductHistory(p.id, days, date);
  if (history.length) return history.map((h) => ({ ...h, units_sold_total: null }));
  const own = (await repo.getProductSnapshots(p.id, days)).filter((s) => s.date < date);
  const previous = [...own].reverse().find((s) => s.units_sold_total !== null && s.units_sold_total !== undefined);
  let today = p.estimated_sales;
  if (today === null && p.units_sold_total != null && previous?.units_sold_total != null) {
    const elapsed = Math.max(1, daysBetween(previous.date, date));
    today = Math.max(0, (p.units_sold_total - previous.units_sold_total) / elapsed);
  }
  return [
    ...own.map((s) => ({
      date: s.date,
      estimated_sales: s.estimated_sales,
      affiliates: s.affiliates,
      units_sold_total: s.units_sold_total ?? null,
    })),
    { date, estimated_sales: today, affiliates: p.active_affiliates, units_sold_total: p.units_sold_total ?? null },
  ];
}

const knownSales = (points: Point[]) =>
  points.filter((pt) => pt.estimated_sales !== null).map((pt) => Math.round(pt.estimated_sales as number));

/**
 * Étapes 1 à 3 de la tâche nocturne : récupère les produits du jour, enregistre l'instantané
 * quotidien et calcule le score d'opportunité. Avec `backfillDays`, recalcule aussi les jours passés
 * (utilisé par le seed pour remplir 30 jours d'historique fictif).
 */
export async function refreshCatalog(options: RefreshOptions = {}): Promise<RefreshResult> {
  const started = Date.now();
  const date = options.date ?? parisDate();
  const repo = options.repo ?? getRepo();
  const provider = options.provider ?? getProvider();
  const backfillDays = Math.max(1, options.backfillDays ?? 1);

  const products = await provider.fetchTrendingProducts({ country: 'FR', date });
  if (provider.name !== 'mock' && products.length === 0) {
    throw new Error(`${provider.name} : aucun produit vendu en France n’a été reçu.`);
  }
  const totalDays = HISTORY_DAYS + GROWTH_WINDOW + backfillDays;
  const series = await mapWithConcurrency(products, 8, (p) => seriesFor(p, provider, repo, date, totalDays));

  const days = dateRange(date, backfillDays);
  const snapshots: ProductSnapshot[] = [];
  let todayScores = new Map<string, ScoreBreakdown>();

  for (const day of days) {
    const points = series.map((history) => history.filter((h) => h.date <= day));
    const inputs: ScoreInput[] = products.map((p, i) => ({
      id: p.id,
      niche: p.niche,
      price_cents: p.price_cents,
      commission_rate: p.commission_rate,
      affiliates: points[i].at(-1)?.affiliates ?? p.active_affiliates,
      sales: knownSales(points[i]).slice(-GROWTH_WINDOW),
      windows: day === date ? (p.sales_windows ?? null) : null,
    }));
    const scores = scoreProducts(inputs);
    inputs.forEach((input, i) => {
      const breakdown = scores.get(input.id)!;
      const last = points[i].at(-1);
      snapshots.push({
        product_id: input.id,
        date: day,
        estimated_sales: last?.date === day ? last.estimated_sales : null,
        affiliates: input.affiliates,
        units_sold_total: last?.date === day ? last.units_sold_total : null,
        score: breakdown.total,
        score_breakdown: breakdown,
        trend: trendOf(breakdown),
      });
    });
    if (day === date) todayScores = scores;
  }

  // Vidéos de référence : tous les produits pour le mock (gratuit) ; pour une source payante, seulement les
  // NEXSCOPE_MAX_VIDEO_CALLS_PER_NIGHT meilleurs produits de la nuit, et pas ceux chargés il y a moins de 3 jours.
  const ranked = [...products].sort((a, b) => (todayScores.get(b.id)?.total ?? 0) - (todayScores.get(a.id)?.total ?? 0));
  const existing = new Map((await repo.getProducts(products.map((p) => p.id))).map((p) => [p.id, p]));
  const now = new Date();
  const videoTargets =
    provider.name === 'mock'
      ? ranked.map((p) => p.id)
      : ranked
          .slice(0, env.nexscopeMaxVideoCallsPerNight)
          .map((p) => p.id)
          .filter((id) => !videosAreFresh(existing.get(id)?.videos_fetched_at, now));
  const videos = new Map<string, TopVideo[]>();
  await mapWithConcurrency(videoTargets, 4, async (id) => {
    try {
      videos.set(id, await provider.fetchTopVideos(id));
    } catch {
      // Échec (quota, réseau) : on garde les vidéos déjà connues, on réessaiera la nuit suivante.
    }
  });

  // Ventes par période : seulement pour les produits dont nos relevés sont encore trop courts pour la courbe.
  let details = new Map<string, ProductDetails>();
  if (provider.fetchProductDetails) {
    // Les mieux notés d'abord, plafonnés pour une source payante (NEXSCOPE_MAX_DETAIL_PRODUCTS_PER_NIGHT, 40).
    const shortIds = new Set(
      products.filter((p, i) => knownSales(series[i].filter((h) => h.date <= date)).length < MIN_DAYS_FOR_CURVE).map((p) => p.id),
    );
    const shortRanked = ranked.filter((p) => shortIds.has(p.id)).map((p) => p.id);
    const short = provider.name === 'mock' ? shortRanked : shortRanked.slice(0, env.nexscopeMaxDetailProductsPerNight);
    if (short.length) {
      try {
        details = await provider.fetchProductDetails(short, date);
      } catch {
        // Facultatif : la fiche dit simplement que la courbe se remplit chaque nuit.
      }
    }
  }

  const nowIso = new Date().toISOString();
  const rows: Product[] = products.map((p: ProviderProduct, i) => {
    const breakdown = todayScores.get(p.id)!;
    const window = series[i].filter((h) => h.date <= date && h.date > addDays(date, -HISTORY_DAYS));
    return {
      id: p.id,
      provider: provider.name,
      name: p.name,
      niche: p.niche,
      description: p.description,
      shop_name: p.shop_name,
      price_cents: p.price_cents,
      commission_rate: p.commission_rate,
      active_affiliates: p.active_affiliates,
      image_url: p.image_url,
      top_videos: videos.has(p.id) ? videos.get(p.id)! : (existing.get(p.id)?.top_videos ?? []),
      videos_fetched_at: videos.has(p.id) ? now.toISOString() : (existing.get(p.id)?.videos_fetched_at ?? null),
      details: details.get(p.id) ?? existing.get(p.id)?.details ?? null,
      snapshot_date: date,
      latest_score: breakdown.total,
      latest_breakdown: breakdown,
      trend: trendOf(breakdown),
      growth_7d: breakdown.growth_7d ?? 0,
      sales_30d: knownSales(window),
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
    videos: videos.size,
    details: details.size,
    ...(provider.stats ? { stats: provider.stats() } : {}),
  };
}
