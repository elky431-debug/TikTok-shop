import { getLiveCatalog, isDemoProduct } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import type { PlanId, Product, Profile, ScoreBreakdown, Trend } from '@/lib/db/types';
import { ensureCatalog } from '@/lib/jobs/nightly';
import type { NicheId } from '@/lib/niches';
import { applyFilters, hasFilters, type RadarFilters } from '@/lib/radar-filters';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { rankForUser, visibleProductIds } from '@/lib/radar-rules';
import { fallbackImageUrl } from '@/lib/product-image';
import { commissionPerSale } from '@/lib/score';
import { parisDate } from '@/lib/utils';

export * from '@/lib/radar-filters';

/** Vue d'un produit adaptée au plan : le score et ses points sont retirés en gratuit. */
export interface ProductView {
  id: string;
  name: string;
  niche: NicheId;
  shop_name: string;
  description: string;
  image_url: string;
  /** Visuel SVG de repli si l'image du fournisseur manque ou ne charge pas. */
  image_fallback: string;
  price_cents: number;
  commission_rate: number;
  commission_cents: number;
  /** null = la source ne le dit pas. */
  free_sample: boolean | null;
  /** null = la source ne le dit pas. */
  active_affiliates: number | null;
  trend: Trend;
  growth_7d: number;
  /** false = croissance pas encore mesurable (historique trop court) : l'affichage dit « tendance en mesure ». */
  growth_known: boolean;
  /** Produit fictif (démonstration). */
  demo: boolean;
  sales_7d: number[];
  sales_30d: number[];
  score: number | null;
  breakdown: (Omit<ScoreBreakdown, 'total' | 'parts'> & {
    parts: Array<{
      key: string;
      label: string;
      weight: number;
      available: boolean;
      applied_weight: number;
      points: number | null;
      sentence: string;
    }>;
  }) | null;
  top_videos: Product['top_videos'];
  saved: boolean;
}

export function toProductView(product: Product, plan: PlanId, saved = false): ProductView {
  const showScore = getPlan(plan).showScore;
  const breakdown = product.latest_breakdown;
  return {
    id: product.id,
    name: product.name,
    niche: product.niche,
    shop_name: product.shop_name,
    description: product.description,
    image_url: product.image_url,
    image_fallback: fallbackImageUrl(product.id, product.niche),
    price_cents: product.price_cents,
    commission_rate: product.commission_rate,
    commission_cents: commissionPerSale(product.price_cents, product.commission_rate),
    free_sample: product.free_sample,
    active_affiliates: product.active_affiliates,
    trend: product.trend,
    growth_7d: product.growth_7d,
    growth_known: breakdown ? breakdown.growth_7d !== null : true,
    demo: isDemoProduct(product),
    sales_7d: product.sales_30d.slice(-7),
    sales_30d: product.sales_30d,
    score: showScore ? product.latest_score : null,
    breakdown: breakdown
      ? {
          growth_7d: breakdown.growth_7d,
          daily_sales_7d: breakdown.daily_sales_7d,
          summary: breakdown.summary,
          parts: breakdown.parts.map((p) => ({
            key: p.key,
            label: p.label,
            weight: p.weight,
            available: p.available !== false,
            applied_weight: p.applied_weight ?? p.weight,
            points: showScore ? p.points : null,
            sentence: p.sentence,
          })),
        }
      : null,
    top_videos: product.top_videos,
    saved,
  };
}

export type RadarItem =
  | { kind: 'visible'; rank: number; product: ProductView }
  | { kind: 'locked'; rank: number; key: string; niche: NicheId };

export interface Radar {
  date: string | null;
  /** Produits fictifs (aucune source réelle branchée). */
  demo: boolean;
  /** Dernier relevé de plus de 36 heures : afficher « Données du [date] ». */
  stale: boolean;
  /** La source dit-elle quels produits ont un échantillon gratuit ? Sinon, le filtre est masqué. */
  sampleKnown: boolean;
  plan: PlanId;
  niches: NicheId[];
  items: RadarItem[];
  totalToday: number;
  visibleCount: number;
  lockedCount: number;
  filtered: boolean;
}

/**
 * Radar de l'utilisateur. La limite du plan gratuit est appliquée ici, côté serveur :
 * les produits verrouillés ne transportent ni nom, ni identifiant, ni chiffre.
 */
export async function getRadar(profile: Profile, filters: RadarFilters): Promise<Radar> {
  await ensureCatalog();
  const repo = getRepo();
  const [catalog, saved] = await Promise.all([getLiveCatalog(repo), repo.listSavedProducts(profile.id)]);
  const products = catalog.products;
  const savedIds = new Set(saved.map((s) => s.product_id));
  const ranked = rankForUser(products, profile.niches);
  const visible = visibleProductIds(ranked, profile.plan);
  const filtered = applyFilters(ranked, filters);

  const items: RadarItem[] = filtered.map((product, index) =>
    visible.has(product.id)
      ? { kind: 'visible', rank: index + 1, product: toProductView(product, profile.plan, savedIds.has(product.id)) }
      : { kind: 'locked', rank: index + 1, key: `verrou-${index}`, niche: product.niche },
  );

  return {
    date: catalog.dataDate,
    demo: catalog.demo,
    stale: catalog.stale,
    sampleKnown: products.some((p) => p.free_sample !== null),
    plan: profile.plan,
    niches: profile.niches,
    items,
    totalToday: ranked.length,
    visibleCount: items.filter((i) => i.kind === 'visible').length,
    lockedCount: items.filter((i) => i.kind === 'locked').length,
    filtered: hasFilters(filters),
  };
}

/**
 * Un compte gratuit n'ouvre que ses 3 produits du jour et ceux qu'il suit déjà.
 * Les plans payants ouvrent tout le catalogue.
 */
export async function canAccessProduct(profile: Profile, productId: string): Promise<boolean> {
  if (isPaidPlan(profile.plan)) return true;
  const repo = getRepo();
  if (await repo.getSavedProduct(profile.id, productId)) return true;
  const ranked = rankForUser((await getLiveCatalog(repo)).products, profile.niches);
  return visibleProductIds(ranked, profile.plan).has(productId);
}

export function todayLabel(date: string | null): string {
  return date === parisDate() ? "aujourd'hui" : date ?? '—';
}
