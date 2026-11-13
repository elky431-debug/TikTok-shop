import { getLiveCatalog } from '@/lib/catalog';
import { nicheFromCategories, toCents, toCount } from '@/lib/data/classify';
import { mapNexscopeProduct, NexscopeProvider, type NexscopeDiscoveryProduct } from '@/lib/data/nexscope';
import { getRepo, type Repo } from '@/lib/db';
import type { Profile, RegionId } from '@/lib/db/types';
import { env } from '@/lib/env';
import type { NicheId } from '@/lib/niches';
import { getPlan } from '@/lib/plans';
import { regionFor } from '@/lib/regions';
import { commissionPerSale } from '@/lib/score';
import { remainingToday } from '@/lib/v2/quota';
import { parisDate, parisTimeToUtc } from '@/lib/utils';
import { categoryPath, productMetrics } from './metrics';

/**
 * Recherche par mot-clé à la demande (bloc 1). Source : Nexscope `tiktok-product-discovery` avec `keyword` et le pays
 * de l'utilisateur (FR). Quota par plan côté serveur (`keywordSearchesPerDay` : Gratuit 0, Pro 5, Pro+ 30 par jour) ;
 * relancer le même mot-clé le même jour ne compte pas deux fois. Réponses gardées 24 h dans le cache serveur, partagé :
 * le même mot-clé cherché par deux personnes ne coûte qu'un appel.
 * Sans clé Nexscope : recherche dans le catalogue du jour (dit à l'écran), jamais de résultat inventé.
 */
export const SEARCH_KIND = 'recherche';
export const SEARCH_CACHE_HOURS = 24;
const CACHE_PREFIX = 'recherche-mot-cle';

export interface KeywordResult {
  id: string;
  name: string;
  niche: NicheId | null;
  category: string[];
  shop_name: string;
  image_url: string;
  price_cents: number;
  /** Fourchette de prix des variantes, en euros seulement (sinon null). */
  price_min_cents: number | null;
  price_max_cents: number | null;
  commission_rate: number;
  commission_cents: number;
  sales_7d: number | null;
  /** Ventes sur 28 jours (période de la source) ou 30 jours (catalogue). */
  sales_month: number | null;
  sales_month_days: 28 | 30;
  affiliates: number | null;
  rating: number | null;
  review_count: number | null;
}

export interface SearchRecord {
  keyword: string;
  region: RegionId;
  source: 'nexscope' | 'catalogue';
  results: KeywordResult[];
  /** Produits écartés (autre devise, sans commission…). */
  skipped: number;
}

/** Mot-clé nettoyé (espaces, casse, 80 caractères) ; null s'il est trop court. */
export function normalizeKeyword(raw: unknown): string | null {
  const keyword = String(raw ?? '')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 80);
  return keyword.length >= 2 ? keyword : null;
}

export const searchCacheKey = (region: RegionId, keyword: string) => `${CACHE_PREFIX}|${region}|${keyword}`;

/**
 * Un produit de la réponse (champs documentés de tiktok-product-discovery). Mêmes garde-fous que le relevé de nuit
 * (pays, devise, commission, fiche anormale) ; la niche vient de la catégorie, null si elle n'est pas reconnue.
 */
export function mapKeywordResult(raw: Record<string, unknown>, region: RegionId = 'FR'): KeywordResult | null {
  const product = raw as NexscopeDiscoveryProduct & Record<string, unknown>;
  const niche = nicheFromCategories([product.categoryName]);
  const mapped = mapNexscopeProduct(product, niche ?? 'maison', region);
  if (!mapped.ok) return null;
  const p = mapped.product;
  // mapNexscopeProduct a déjà écarté toute autre devise que l'euro (« € », « EUR » ou absente pour un pays de la zone euro).
  const rating = Number(product.productRating);
  const minPrice = toCents(product.minPrice);
  const maxPrice = toCents(product.maxPrice);
  return {
    id: p.id,
    name: p.name,
    niche,
    category: categoryPath(p.description),
    shop_name: p.shop_name,
    image_url: p.image_url,
    price_cents: p.price_cents,
    price_min_cents: minPrice !== null && maxPrice !== null && maxPrice > minPrice ? minPrice : null,
    price_max_cents: minPrice !== null && maxPrice !== null && maxPrice > minPrice ? maxPrice : null,
    commission_rate: p.commission_rate,
    commission_cents: commissionPerSale(p.price_cents, p.commission_rate),
    sales_7d: toCount(product.totalSale7dCnt),
    sales_month: toCount(product.totalSale28dCnt),
    sales_month_days: 28,
    affiliates: p.active_affiliates,
    rating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
    review_count: toCount(product.reviewCount),
  };
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Sans clé Nexscope : produits du catalogue du jour dont le nom contient tous les mots cherchés. */
async function searchCatalog(keyword: string, region: RegionId, repo: Repo): Promise<KeywordResult[]> {
  const words = fold(keyword).split(' ').filter(Boolean);
  const { products } = await getLiveCatalog(repo, new Date(), region);
  return products
    .filter((p) => words.every((w) => fold(`${p.name} ${p.shop_name}`).includes(w)))
    .sort((a, b) => b.latest_score - a.latest_score)
    .slice(0, 10)
    .map((p) => {
      const m = productMetrics(p);
      return {
        id: p.id,
        name: p.name,
        niche: p.niche,
        category: m.category,
        shop_name: p.shop_name,
        image_url: p.image_url,
        price_cents: p.price_cents,
        price_min_cents: null,
        price_max_cents: null,
        commission_rate: p.commission_rate,
        commission_cents: m.commission_cents,
        sales_7d: m.sales_7d,
        sales_month: m.sales_30d,
        sales_month_days: 30,
        affiliates: m.affiliates,
        rating: m.rating,
        review_count: m.review_count,
      };
    });
}

export interface SearchSource {
  searchProducts(keyword: string, region: string): Promise<Record<string, unknown>[]>;
}

/** Résultats d'un mot-clé : cache de 24 h, sinon Nexscope (si sa clé est là), sinon le catalogue du jour. */
export async function searchKeyword(
  keyword: string,
  region: RegionId,
  options: { repo?: Repo; source?: SearchSource } = {},
): Promise<Omit<SearchRecord, 'keyword' | 'region'>> {
  const repo = options.repo ?? getRepo();
  if (!env.nexscopeApiKey && !options.source) {
    return { source: 'catalogue', results: await searchCatalog(keyword, region, repo), skipped: 0 };
  }
  const key = searchCacheKey(region, keyword);
  const cached = (await repo.getProviderCache(key)) as { results?: KeywordResult[]; skipped?: number } | null;
  if (cached && Array.isArray(cached.results)) return { source: 'nexscope', results: cached.results, skipped: cached.skipped ?? 0 };
  const source = options.source ?? new NexscopeProvider();
  const raw = await source.searchProducts(keyword, region);
  const results: KeywordResult[] = [];
  for (const item of raw) {
    const mapped = mapKeywordResult(item, region);
    if (mapped && !results.some((r) => r.id === mapped.id)) results.push(mapped);
  }
  const skipped = raw.length - results.length;
  await repo.setProviderCache(key, { results, skipped }, new Date(Date.now() + SEARCH_CACHE_HOURS * 3_600_000).toISOString());
  return { source: 'nexscope', results, skipped };
}

export type SearchOutcome = { ok: true; id: string; reused: boolean } | { ok: false; reason: 'plan' | 'quota' | 'mot' | 'source' };

/** Recherche demandée par un utilisateur : plan et quota vérifiés ici, côté serveur. */
export async function runKeywordSearch(
  profile: Pick<Profile, 'id' | 'plan' | 'region'>,
  rawKeyword: unknown,
  options: { repo?: Repo; source?: SearchSource; now?: Date } = {},
): Promise<SearchOutcome> {
  const repo = options.repo ?? getRepo();
  const limit = getPlan(profile.plan).keywordSearchesPerDay;
  if (!limit) return { ok: false, reason: 'plan' };
  const keyword = normalizeKeyword(rawKeyword);
  if (!keyword) return { ok: false, reason: 'mot' };
  const region = regionFor(profile);
  const now = options.now ?? new Date();
  const since = parisTimeToUtc(parisDate(now), 0).toISOString();
  const today = (await repo.listRecords<SearchRecord>(profile.id, SEARCH_KIND)).find(
    (r) => r.created_at >= since && r.data.keyword === keyword && r.data.region === region,
  );
  if (today) return { ok: true, id: today.id, reused: true };
  if ((await remainingToday(profile.id, SEARCH_KIND, limit, now)) <= 0) return { ok: false, reason: 'quota' };
  let found: Omit<SearchRecord, 'keyword' | 'region'>;
  try {
    found = await searchKeyword(keyword, region, { repo, source: options.source });
  } catch (error) {
    console.error('[recherche]', error instanceof Error ? error.message : error);
    return { ok: false, reason: 'source' };
  }
  const record = await repo.saveRecord<SearchRecord>(profile.id, SEARCH_KIND, { keyword, region, ...found });
  return { ok: true, id: record.id, reused: false };
}

/** Recherches restantes aujourd'hui (Infinity n'arrive pas : le quota est toujours fini). */
export async function remainingSearches(profile: Pick<Profile, 'id' | 'plan'>, now = new Date()): Promise<number> {
  return remainingToday(profile.id, SEARCH_KIND, getPlan(profile.plan).keywordSearchesPerDay, now);
}
