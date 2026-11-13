import { getLiveCatalog, isDemoProduct } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import type { PlanId, Product, Profile, RegionId, ScoreBreakdown, Trend } from '@/lib/db/types';
import { ensureCatalog } from '@/lib/jobs/nightly';
import type { NicheId } from '@/lib/niches';
import { filterAvailability, filterTarget, hasFilters, matchesFilters, type FilterAvailability, type FilterTarget, type RadarFilters } from '@/lib/radar-filters';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { rankForUser, visibleProductIds } from '@/lib/radar-rules';
import { badgesFor, type BadgeId } from '@/lib/radar/badges';
import { productMetrics } from '@/lib/radar/metrics';
import { computeScores, type ScoreSet, type Weights } from '@/lib/radar/personal';
import { effectiveWeights, getFavorites, getRadarSettings, type RadarSettings } from '@/lib/radar/settings';
import { defaultOrder, SCORE_SORTS, sortBy, type SortKey, type SortOrder } from '@/lib/radar/sort';
import { ensureWhyNow, type WhyNow } from '@/lib/radar/why-now';
import { fallbackImageUrl } from '@/lib/product-image';
import { commissionPerSale } from '@/lib/score';
import { regionFor } from '@/lib/regions';
import { parisDate } from '@/lib/utils';

export * from '@/lib/radar-filters';

/** Chiffres montrés d'un produit (null = la source ne le dit pas : la colonne, le filtre ou la ligne se masquent). */
export interface ProductFigures {
  sales_7d: number | null;
  sales_30d: number | null;
  growth_7d: number | null;
  rating: number | null;
  review_count: number | null;
  first_seen: string | null;
  age_days: number | null;
  category: string[];
  subcategory: string | null;
}

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
  active_affiliates: number | null;
  trend: Trend;
  growth_7d: number;
  /** false = croissance pas encore mesurable (historique trop court) : l'affichage dit « tendance en mesure ». */
  growth_known: boolean;
  /** Produit fictif (démonstration). */
  demo: boolean;
  sales_7d: number[];
  sales_30d: number[];
  /** Score général (poids par défaut, ou poids réglés en Pro+). */
  score: number | null;
  /** Score pour toi (niches, tranche d'abonnés, style). */
  personal_score: number | null;
  breakdown: (Omit<ScoreBreakdown, 'total' | 'raw' | 'parts'> & {
    /** Total des points avant mise à l'échelle (null si le plan masque le score). */
    raw: number | null;
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
  figures: ProductFigures;
  badges: BadgeId[];
  why_now: WhyNow | null;
  saved: boolean;
  favorite: boolean;
}

export interface ViewExtras {
  scores?: ScoreSet;
  whyNow?: WhyNow | null;
  favorite?: boolean;
}

export function toProductView(product: Product, plan: PlanId, saved = false, extras: ViewExtras = {}): ProductView {
  const showScore = getPlan(plan).showScore;
  const breakdown = product.latest_breakdown;
  const metrics = productMetrics(product);
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
    active_affiliates: product.active_affiliates,
    trend: product.trend,
    growth_7d: product.growth_7d,
    growth_known: breakdown ? breakdown.growth_7d !== null : true,
    demo: isDemoProduct(product),
    sales_7d: product.sales_30d.slice(-7),
    sales_30d: product.sales_30d,
    score: showScore ? (extras.scores?.score ?? product.latest_score) : null,
    personal_score: showScore ? (extras.scores?.personal ?? null) : null,
    breakdown: breakdown
      ? {
          growth_7d: breakdown.growth_7d,
          daily_sales_7d: breakdown.daily_sales_7d,
          summary: breakdown.summary,
          raw: showScore ? (breakdown.raw ?? null) : null,
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
    figures: {
      sales_7d: metrics.sales_7d,
      sales_30d: metrics.sales_30d,
      growth_7d: metrics.growth_7d,
      rating: metrics.rating,
      review_count: metrics.review_count,
      first_seen: metrics.first_seen,
      age_days: metrics.age_days,
      category: metrics.category,
      subcategory: metrics.subcategory,
    },
    badges: badgesFor(metrics),
    why_now: extras.whyNow ?? null,
    saved,
    favorite: extras.favorite ?? false,
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
  /** Pays du catalogue affiché. */
  region: RegionId;
  plan: PlanId;
  niches: NicheId[];
  items: RadarItem[];
  totalToday: number;
  visibleCount: number;
  lockedCount: number;
  filtered: boolean;
  /** Filtres proposés (ceux dont au moins un produit du jour a la donnée). */
  availability: FilterAvailability;
  sort: SortKey;
  order: SortOrder;
  settings: RadarSettings;
  /** Poids appliqués (Pro+), null = réglage par défaut. */
  weights: Weights | null;
}

export interface RadarOptions {
  sort?: SortKey;
  order?: SortOrder;
  /** Réglages déjà lus (sinon lus ici). */
  settings?: RadarSettings;
}

/** Valeur d'une colonne pour le tri (null = inconnue, toujours en bas). */
export function sortValue(view: ProductView, key: SortKey): number | string | null {
  switch (key) {
    case 'score':
      return view.score;
    case 'pourtoi':
      return view.personal_score;
    case 'prix':
      return view.price_cents;
    case 'commission':
      return view.commission_rate;
    case 'comeur':
      return view.commission_cents;
    case 'ventes7':
      return view.figures.sales_7d;
    case 'ventes30':
      return view.figures.sales_30d;
    case 'croissance':
      return view.figures.growth_7d;
    case 'affilies':
      return view.active_affiliates;
    case 'note':
      return view.figures.rating;
    case 'avis':
      return view.figures.review_count;
    case 'nouveaute':
      return view.figures.first_seen;
    case 'nom':
      return view.name;
  }
}

/** Scores du catalogue du jour pour cet utilisateur (poids Pro+ et score pour toi). */
export function scoresFor(products: Product[], profile: Profile, settings: RadarSettings): Map<string, ScoreSet> {
  return computeScores(products, profile, effectiveWeights(profile, settings));
}

/**
 * Radar de l'utilisateur. La limite du plan gratuit est appliquée ici, côté serveur :
 * les produits verrouillés ne transportent ni nom, ni identifiant, ni chiffre. En Gratuit, le tri ne s'applique qu'à
 * ses produits visibles (les verrouillés gardent leur place, sans rien révéler de leurs chiffres).
 */
export async function getRadar(profile: Profile, filters: RadarFilters, options: RadarOptions = {}): Promise<Radar> {
  await ensureCatalog();
  const repo = getRepo();
  const region = regionFor(profile);
  const [catalog, saved, favorites, settings] = await Promise.all([
    getLiveCatalog(repo, new Date(), region),
    repo.listSavedProducts(profile.id),
    getFavorites(profile.id, repo),
    options.settings ? Promise.resolve(options.settings) : getRadarSettings(profile.id, repo),
  ]);
  const plan = getPlan(profile.plan);
  const products = catalog.products;
  const savedIds = new Set(saved.map((s) => s.product_id));
  const favoriteIds = new Set(favorites);
  const ranked = rankForUser(products, profile.niches);
  const visible = visibleProductIds(ranked, profile.plan);
  const targets = new Map<string, FilterTarget>(ranked.map((p) => [p.id, filterTarget(p)]));
  const filtered = ranked.filter((p) => matchesFilters(targets.get(p.id)!, filters));
  const scores = plan.showScore ? scoresFor(products, profile, settings) : new Map<string, ScoreSet>();

  const visibleProducts = filtered.filter((p) => visible.has(p.id));
  const whyNow = catalog.dataDate
    ? await ensureWhyNow(visibleProducts, region, catalog.dataDate, { repo }).catch(() => ({}) as Record<string, WhyNow>)
    : {};

  let sort = options.sort ?? settings.tri;
  if (!plan.showScore && SCORE_SORTS.includes(sort)) sort = 'score';
  const order = options.order ?? (options.sort ? defaultOrder(sort) : settings.ordre);

  const views = visibleProducts.map((p) =>
    toProductView(p, profile.plan, savedIds.has(p.id), { scores: scores.get(p.id), whyNow: whyNow[p.id] ?? null, favorite: favoriteIds.has(p.id) }),
  );
  // Par défaut (score décroissant), le classement du jour est gardé tel quel en Gratuit (score masqué).
  const sortedViews = !plan.showScore && sort === 'score' ? views : sortBy(views, order, (v) => sortValue(v, sort));
  const lockedProducts = filtered.filter((p) => !visible.has(p.id));

  const items: RadarItem[] = [
    ...sortedViews.map((product, index) => ({ kind: 'visible' as const, rank: index + 1, product })),
    ...lockedProducts.map((product, index) => ({
      kind: 'locked' as const,
      rank: sortedViews.length + index + 1,
      key: `verrou-${index}`,
      niche: product.niche,
    })),
  ];

  return {
    date: catalog.dataDate,
    demo: catalog.demo,
    stale: catalog.stale,
    region,
    plan: profile.plan,
    niches: profile.niches,
    items,
    totalToday: ranked.length,
    visibleCount: sortedViews.length,
    lockedCount: lockedProducts.length,
    filtered: hasFilters(filters),
    availability: filterAvailability([...targets.values()]),
    sort,
    order,
    settings,
    weights: effectiveWeights(profile, settings),
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
  const ranked = rankForUser((await getLiveCatalog(repo, new Date(), regionFor(profile))).products, profile.niches);
  return visibleProductIds(ranked, profile.plan).has(productId);
}

/** Identifiants ouverts à ce compte aujourd'hui (Gratuit : ses 3 produits du jour et ceux qu'il suit). null = tout. */
export async function accessibleIds(profile: Profile, products: Product[]): Promise<Set<string> | null> {
  if (isPaidPlan(profile.plan)) return null;
  const saved = await getRepo().listSavedProducts(profile.id);
  const ids = visibleProductIds(rankForUser(products, profile.niches), profile.plan);
  for (const s of saved) ids.add(s.product_id);
  return ids;
}

export function todayLabel(date: string | null): string {
  return date === parisDate() ? "aujourd'hui" : date ?? '—';
}
