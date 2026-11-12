import type { TopVideo } from '@/lib/db/types';
import { env } from '@/lib/env';
import { NICHE_IDS, type NicheId } from '@/lib/niches';
import { checkImage, toCents, toCount, type MapResult } from './classify';
import { BudgetExceededError, ProviderClient, ProviderHttpError, httpError, type CacheStore, type RawResponse } from './http';
import type { ProductDataProvider, ProviderProduct, ProviderRunStats, SalesPoint, TrendingQuery } from './provider';
import { ProviderConfigError } from './provider';

/**
 * Nexscope : fournisseur de données sous contrat (clé d'API), qui revend des données TikTok Shop de prestataires
 * tiers (FastMoss pour la recherche de produits). Aucun scraping de notre part.
 *
 * Documentation lue : dépôt officiel `nexscope-ai/nexscope-ecommerce-api` (copie de la doc du 2026-09-10,
 * le site nexscope.ai n'étant pas joignable d'ici) :
 *  - docs/calling-apis.md : POST …/skills/{slug}/run, en-tête « Authorization: Bearer », débit partagé par
 *    fenêtre glissante d'1 s, 429 + code 13012 (débit) ou 13013 (concurrence) avec Retry-After ;
 *  - docs/data/tiktok-product-discovery.md : recherche par catégorie (nom anglais), région FR, tri
 *    `day7_units_sold`, 10 produits par page au maximum ;
 *  - docs/data/tiktok-video-search.md : vidéos d'un produit (`productId`, région FR, tri par vues).
 * Les exemples de réponse publiés sont d'anciens gabarits « pas encore réconciliés avec l'enveloppe HTTP
 * actuelle » : la lecture cherche donc la liste `products` sous `data`/`result`, comme le fait le client de
 * Nexscope lui-même, et tout champ absent reste vide.
 *
 * Ce que la source ne fournit pas : échantillon gratuit (aucun champ), historique jour par jour (seulement des
 * cumuls sur 1, 7, 28 et 90 jours, d'où la croissance « 7 derniers jours / moyenne des 3 semaines d'avant »).
 */

export const NEXSCOPE_API_BASE = 'https://api.nexscope.ai/api/skill-api/v1/skills';
export const NEXSCOPE_SLUGS = { discovery: 'tiktok-product-discovery', videos: 'tiktok-video-search' } as const;

/** Taille de page maximum de tiktok-product-discovery. */
const PAGE_SIZE = 10;
const RATE_LIMIT_CODES = new Set([13012, 13013]);
const ERROR_MESSAGES: Record<number, string> = {
  11209: 'clé d’API refusée (NEXSCOPE_API_KEY)',
  13011: 'crédits Nexscope épuisés',
  99001: 'paramètres refusés',
  99000: 'erreur inattendue chez Nexscope',
};

/**
 * Catégorie de premier niveau TikTok Shop (nom anglais, « traduit automatiquement en identifiant » d'après la doc)
 * pour chaque niche. TODO(nexscope) : confirmer au premier appel réel que chaque nom est bien reconnu pour la France.
 */
export const NEXSCOPE_CATEGORIES: Record<NicheId, string> = {
  beaute: 'Beauty & Personal Care',
  maison: 'Home Supplies',
  mode: 'Womenswear & Underwear',
  tech: 'Phones & Electronics',
  sport: 'Sports & Outdoor',
  animaux: 'Pet Supplies',
  bebe: 'Baby & Maternity',
};

/** Champs documentés de tiktok-product-discovery (products[]). */
export interface NexscopeDiscoveryProduct {
  productId?: string;
  title?: string;
  region?: string;
  currency?: string | null;
  price?: number;
  minPrice?: number;
  totalSaleCnt?: number;
  totalSale1dCnt?: number;
  totalSale7dCnt?: number;
  totalSale28dCnt?: number;
  totalIflCnt?: number;
  productCommissionRate?: number;
  shopName?: string;
  categoryName?: string;
  imageUrl?: string;
}

/** Cherche la première liste d'objets sous la clé voulue, à travers `data` / `result` (enveloppe variable). */
export function findList(json: unknown, key: string, depth = 0): Record<string, unknown>[] | null {
  if (!json || typeof json !== 'object' || depth > 4) return null;
  const record = json as Record<string, unknown>;
  if (Array.isArray(record[key])) return record[key] as Record<string, unknown>[];
  for (const next of ['data', 'result']) {
    const found = findList(record[next], key, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Vérifie l'enveloppe { code, msg, data } (succès seulement si code === 0) et les codes du prestataire. */
export function checkNexscopeResponse(response: RawResponse): unknown {
  const json = (response.json ?? {}) as { code?: number | string; msg?: string; data?: { errcode?: number; errmsg?: string } };
  const code = json.code === undefined ? null : Number(json.code);
  if (code !== null && RATE_LIMIT_CODES.has(code)) {
    throw new ProviderHttpError(`Nexscope : trop de requêtes (code ${code})`, response.status || 429, true, response.retryAfterMs);
  }
  if (response.status !== 200) {
    const detail = code !== null ? (ERROR_MESSAGES[code] ?? json.msg ?? `code ${code}`) : json.msg;
    throw httpError('Nexscope', response, detail);
  }
  if (code !== null && code !== 0) {
    throw new ProviderHttpError(`Nexscope : ${ERROR_MESSAGES[code] ?? json.msg ?? 'réponse en erreur'} (code ${code})`, 200, false);
  }
  const upstream = json.data?.errcode;
  if (upstream !== undefined && upstream !== 0 && upstream !== 200) {
    throw new ProviderHttpError(`Nexscope : erreur du prestataire (${json.data?.errmsg ?? upstream})`, 200, false);
  }
  return response.json;
}

export function mapNexscopeProduct(raw: NexscopeDiscoveryProduct, niche: NicheId): MapResult {
  if (!raw.productId || !raw.title) return { ok: false, reason: 'identifiant ou titre absent' };
  if (raw.region && raw.region !== 'FR') return { ok: false, reason: `région ${raw.region}` };
  // Région FR demandée : une devise absente est l'euro ; une autre devise est écartée.
  if (raw.currency && raw.currency !== 'EUR') return { ok: false, reason: `devise ${raw.currency}` };
  const priceCents = toCents(raw.price) ?? toCents(raw.minPrice);
  if (!priceCents) return { ok: false, reason: 'prix absent' };
  let rate = toCount(raw.productCommissionRate);
  if (rate === null) return { ok: false, reason: 'commission absente' };
  // Documenté en décimal (0,10 = 10 %) ; d'autres points d'accès Nexscope l'expriment en pourcentage.
  if (rate > 1) rate = rate / 100;
  const last7 = toCount(raw.totalSale7dCnt);
  const last28 = toCount(raw.totalSale28dCnt);
  const { image, rejectedHost } = checkImage(raw.imageUrl);

  return {
    ok: true,
    product: {
      id: `nx-${raw.productId}`,
      name: raw.title.trim().slice(0, 200),
      niche,
      description: raw.categoryName ? `Catégorie TikTok Shop : ${raw.categoryName}` : '',
      shop_name: raw.shopName?.trim() ?? '',
      price_cents: priceCents,
      commission_rate: Math.min(1, rate),
      free_sample: null,
      active_affiliates: toCount(raw.totalIflCnt),
      image_url: image,
      estimated_sales: toCount(raw.totalSale1dCnt),
      units_sold_total: toCount(raw.totalSaleCnt),
      // 7 derniers jours contre la moyenne hebdomadaire des 3 semaines précédentes (jours 8 à 28).
      sales_windows: last7 !== null && last28 !== null && last28 >= last7 ? { last7, prev7: (last28 - last7) / 3 } : null,
    },
    ...(rejectedHost ? { rejectedImageHost: rejectedHost } : {}),
  };
}

/** Vidéo documentée de tiktok-video-search. Les données du créateur (pseudo, avatar) ne sont pas lues. */
export function mapNexscopeVideo(raw: Record<string, unknown>): TopVideo | null {
  const views = toCount(raw.totalViewsCnt);
  if (views === null) return null;
  const description = typeof raw.videoDesc === 'string' ? raw.videoDesc.replace(/\s+/g, ' ').trim() : '';
  return {
    title: description.slice(0, 120) || 'Vidéo sans description',
    views,
    estimated_sales: toCount(raw.totalVideoSaleCnt) ?? 0,
    hook: null,
    format: 'Vidéo',
  };
}

export interface NexscopeProviderOptions {
  cache?: CacheStore;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class NexscopeProvider implements ProductDataProvider {
  readonly name = 'nexscope' as const;
  private readonly client: ProviderClient;

  constructor(options: NexscopeProviderOptions = {}) {
    this.client = new ProviderClient({
      provider: 'Nexscope',
      ratePerSecond: env.dataRatePerSecond,
      maxCalls: env.dataMaxCallsPerNight,
      cacheTtlHours: env.dataCacheHours,
      cache: options.cache,
      fetchImpl: options.fetchImpl,
      sleep: options.sleep,
    });
  }

  stats(): ProviderRunStats {
    return this.client.stats();
  }

  private assertConfigured() {
    if (!env.nexscopeApiKey) throw new ProviderConfigError('nexscope', ['NEXSCOPE_API_KEY']);
  }

  private run(slug: string, body: Record<string, unknown>): Promise<unknown> {
    this.assertConfigured();
    const payload = JSON.stringify(body);
    return this.client.request({
      url: `${NEXSCOPE_API_BASE}/${slug}/run`,
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.nexscopeApiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: payload,
      cacheKey: `${slug}|${payload}`,
      parse: checkNexscopeResponse,
    });
  }

  async fetchTrendingProducts(query: TrendingQuery): Promise<ProviderProduct[]> {
    this.assertConfigured();
    const found = new Map<string, ProviderProduct>();
    const niches = query.category ? [query.category] : NICHE_IDS;
    try {
      for (const niche of niches) {
        for (let page = 1; page <= env.dataPagesPerNiche; page++) {
          const json = await this.run(NEXSCOPE_SLUGS.discovery, {
            region: query.country,
            category: NEXSCOPE_CATEGORIES[niche],
            orderField: 'day7_units_sold',
            page,
            pageSize: PAGE_SIZE,
          });
          const products = findList(json, 'products') ?? [];
          for (const raw of products) {
            const result = mapNexscopeProduct(raw as NexscopeDiscoveryProduct, niche);
            if (!result.ok) {
              this.client.noteSkipped();
              continue;
            }
            if (result.rejectedImageHost) this.client.noteRejectedImageHost(result.rejectedImageHost);
            if (!found.has(result.product.id)) found.set(result.product.id, result.product);
          }
          if (products.length < PAGE_SIZE) break;
        }
      }
    } catch (error) {
      if (!(error instanceof BudgetExceededError) || found.size === 0) throw error;
    }
    return [...found.values()];
  }

  async fetchProductHistory(_productId: string, _days: number, _endDate?: string): Promise<SalesPoint[]> {
    // Pas de série jour par jour pour TikTok chez Nexscope : nos instantanés quotidiens prennent le relais.
    return [];
  }

  async fetchTopVideos(productId: string): Promise<TopVideo[]> {
    const json = await this.run(NEXSCOPE_SLUGS.videos, {
      region: 'FR',
      productId: productId.replace(/^nx-/, ''),
      videoSortField: 3,
      sortType: 1,
      pageNum: 1,
      pageSize: 10,
    });
    // TODO(nexscope) : la doc range les vidéos sous `data` et décrit leurs champs sous `columns[]` ; on accepte
    // les deux et on confirmera au premier appel réel.
    const list = findList(json, 'data') ?? findList(json, 'videos') ?? [];
    return list
      .map(mapNexscopeVideo)
      .filter((v): v is TopVideo => v !== null)
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);
  }
}
