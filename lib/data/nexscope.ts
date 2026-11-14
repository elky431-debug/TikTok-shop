import { repairAccents } from '@/lib/tiktok/text';
import type { ProductDetails, TopVideo } from '@/lib/db/types';
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
 *  Pages officielles lues sur www.nexscope.ai/api-docs (12 novembre 2026), pour les routes « ET » :
 *  - data-et-list-product-video : POST https://api.nexscope.ai/et/listProductVideo (`productId`,
 *    `productVideoSortField` 4 = ventes de la vidéo, `sortType` 1 = décroissant, `pageSize` multiple de 10), ~11 crédits ;
 *  - tiktok-batch-product-detail : POST https://api.nexscope.ai/et/batchProductDetail (`productIds`, 1000 au plus),
 *    ventes sur 1, 7, 15, 30, 60 et 90 jours, note, avis, date du premier relevé (`firstCrawlDt`), ~22 crédits.
 *  - tiktok-product-discovery (page relue le 12 novembre 2026, adresse REST affichée : POST
 *    https://api.nexscope.ai/fm/productSearch) accepte aussi `keyword` : utilisé pour la recherche par mot-clé ;
 *  Les vraies réponses (2 appels, 12 novembre 2026) contiennent aussi des champs que la page ne liste pas, mais que
 *  la réponse décrit elle-même dans `columns` (titre de chaque champ) : vues, likes, partages, durée, couverture.
 * Les exemples de réponse publiés sont d'anciens gabarits « pas encore réconciliés avec l'enveloppe HTTP
 * actuelle » : la lecture cherche donc la liste `products` sous `data`/`result`, comme le fait le client de
 * Nexscope lui-même, et tout champ absent reste vide.
 *
 * Ce que la source ne fournit pas : échantillon gratuit (aucun champ dans aucune des routes TikTok, d'où le retrait
 * de ce critère partout), historique jour par jour (seulement des cumuls par période, d'où la croissance « 7 derniers
 * jours / moyenne des 3 semaines d'avant » et le graphique par période tant que nos relevés sont courts).
 */

export const NEXSCOPE_API_BASE = 'https://api.nexscope.ai/api/skill-api/v1/skills';
export const NEXSCOPE_SLUGS = { discovery: 'tiktok-product-discovery' } as const;
/** Routes « ET » documentées sur www.nexscope.ai/api-docs. */
export const NEXSCOPE_ET_BASE = 'https://api.nexscope.ai/et';
/**
 * batchProductDetail accepte 1000 identifiants, mais la vraie route a mis plus de 30 s pour ~100 produits (12 novembre
 * 2026) et une dizaine de secondes pour 10 : lots de 20, avec un délai de 60 s.
 */
const DETAIL_BATCH = 20;
const DETAIL_TIMEOUT_MS = 60_000;

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
  totalVideoCnt?: number;
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

/** Identifiant chez nous : `nx-<id>` pour la France (inchangé), `nx-de-<id>` pour un autre pays. */
export function nexscopeId(productId: string, region = 'FR'): string {
  return region === 'FR' ? `nx-${productId}` : `nx-${region.toLowerCase()}-${productId}`;
}

/** Identifiant de la source à partir du nôtre. */
export const sourceProductId = (id: string) => id.replace(/^nx-(?:[a-z]{2}-)?/, '');

export function mapNexscopeProduct(raw: NexscopeDiscoveryProduct, niche: NicheId, region = 'FR'): MapResult {
  if (!raw.productId || !raw.title) return { ok: false, reason: 'identifiant ou titre absent' };
  if (raw.region && raw.region !== region) return { ok: false, reason: `région ${raw.region}` };
  // Pays de la zone euro demandés : une devise absente est l'euro ; la vraie réponse écrit « € » (la doc annonçait un code).
  const currency = raw.currency?.trim();
  if (currency && currency !== 'EUR' && currency !== '€') return { ok: false, reason: `devise ${currency}` };
  const priceCents = toCents(raw.price) ?? toCents(raw.minPrice);
  if (!priceCents) return { ok: false, reason: 'prix absent' };
  let rate = toCount(raw.productCommissionRate);
  if (rate === null) return { ok: false, reason: 'commission absente' };
  // Vraie réponse (12 novembre 2026) : 0 = pas de commission affiliée, donc pas un produit pour le radar.
  if (rate === 0) return { ok: false, reason: 'pas de commission affiliée' };
  // Documenté en décimal (0,10 = 10 %) ; d'autres points d'accès Nexscope l'expriment en pourcentage (15 = 15 %).
  // TikTok borne la commission entre 1 % et 80 % : entre 0,8 et 1 inclus, impossible de savoir (1 = 100 % ou 1 %),
  // le produit est écarté plutôt que d'afficher une commission inventée.
  if (rate > 0.8 && rate <= 1) return { ok: false, reason: `commission ambiguë (${rate})` };
  if (rate > 1) rate = rate / 100;
  if (rate > 0.8) return { ok: false, reason: `commission hors des bornes de TikTok (${rate})` };
  // Aucun créateur et aucune vidéo : rien ne montre que le produit se vend en affiliation (souvent une fiche
  // anormale : titre anglais, catégorie incohérente). Avec zéro concurrent, il prendrait tous les points.
  if (raw.totalIflCnt === 0 && raw.totalVideoCnt === 0) return { ok: false, reason: 'aucun créateur ni aucune vidéo' };
  const last7 = toCount(raw.totalSale7dCnt);
  const last28 = toCount(raw.totalSale28dCnt);
  const { image, rejectedHost } = checkImage(raw.imageUrl);
  // « Beauty & Personal Care -> Skincare -> Toners\t » dans la vraie réponse.
  const category = raw.categoryName?.split('->').map((part) => part.trim()).filter(Boolean).join(' › ') ?? '';
  // Ventes du jour : moyenne des 7 derniers jours. La vraie réponse renvoie totalSale1dCnt = 0 pour des produits
  // qui vendent des centaines d'unités par jour (donnée de la veille pas encore consolidée) : inutilisable.
  const daily = last7 !== null ? last7 / 7 : toCount(raw.totalSale1dCnt) || null;

  return {
    ok: true,
    product: {
      id: nexscopeId(raw.productId, region),
      name: raw.title.trim().slice(0, 200),
      niche,
      description: category ? `Catégorie TikTok Shop : ${category}` : '',
      shop_name: raw.shopName?.trim() ?? '',
      price_cents: priceCents,
      commission_rate: Math.min(1, rate),
      active_affiliates: toCount(raw.totalIflCnt),
      image_url: image,
      estimated_sales: daily === null ? null : Math.round(daily),
      units_sold_total: toCount(raw.totalSaleCnt),
      // 7 derniers jours contre la moyenne hebdomadaire des 3 semaines précédentes (jours 8 à 28).
      sales_windows: last7 !== null && last28 !== null && last28 >= last7 ? { last7, prev7: (last28 - last7) / 3 } : null,
    },
    ...(rejectedHost ? { rejectedImageHost: rejectedHost } : {}),
  };
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * Vidéo de listProductVideo. Les nombres arrivent en texte (« "200" ») dans la vraie réponse. Les données du
 * créateur (identifiant, pseudo dans l'adresse) ne sont pas stockées à part ; seule l'adresse officielle est gardée,
 * pour ouvrir la vidéo sur TikTok. Le lien de lecture direct (`playAddr`, « peut expirer ») n'est pas utilisé.
 */
export function mapNexscopeVideo(raw: Record<string, unknown>): TopVideo | null {
  if (!raw.videoId) return null;
  const url = text(raw.officialUrl);
  const { image } = checkImage(text(raw.coverUrl));
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(text(raw.createDate))?.[1] ?? null;
  return {
    title: text(raw.videoDesc).slice(0, 160) || 'Vidéo sans description',
    views: toCount(raw.totalViewsCnt),
    estimated_sales: toCount(raw.totalVideoSaleCnt),
    hook: null,
    format: 'Vidéo',
    url: /^https:\/\/www\.tiktok\.com\//.test(url) ? url : null,
    duration_s: toCount(raw.duration),
    likes: toCount(raw.totalDiggCnt),
    shares: toCount(raw.totalSharesCnt),
    published_at: date,
    cover_url: image || null,
  };
}

/** « 20261110 » → « 2026-11-10 ». */
function crawlDate(value: unknown): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(text(String(value ?? '')));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Devise déclarée par la source : l'euro s'écrit « € » dans les vraies réponses, « EUR » dans la doc. */
export const isEuroCurrency = (value: unknown) => typeof value === 'string' && ['€', 'EUR'].includes(value.trim().toUpperCase());

/**
 * Prix minimum et maximum et chiffre d'affaires, seulement si la réponse déclare des euros. La page
 * tiktok-batch-product-detail les annonce en dollars (« Minimum SKU price (USD) ») et ne renvoie pas de devise ; la
 * vraie réponse du 12 novembre 2026 donne 0,01 pour un produit vendu 2,90 € (discovery) : rien n'est lu dans ce cas.
 */
function euroExtras(raw: Record<string, unknown>): Partial<ProductDetails> {
  if (!isEuroCurrency(raw.currency)) return {};
  return {
    price_min_cents: toCents(raw.minPrice),
    price_max_cents: toCents(raw.maxPrice),
    revenue_cents: { d7: toCents(raw.totalSaleGmv7dAmt), d30: toCents(raw.totalSaleGmv30dAmt) },
  };
}

/** Produit de batchProductDetail : ventes par période, note, avis. Les prix (annoncés en dollars) ne sont pas lus. */
export function mapNexscopeDetails(raw: Record<string, unknown>, fetchedAt: string): ProductDetails | null {
  if (!raw.productId) return null;
  const rating = Number(raw.productRating);
  return {
    ...euroExtras(raw),
    sales: {
      d1: toCount(raw.totalSale1dCnt),
      d7: toCount(raw.totalSale7dCnt),
      d15: toCount(raw.totalSale15dCnt),
      d30: toCount(raw.totalSale30dCnt),
      d60: toCount(raw.totalSale60dCnt),
      d90: toCount(raw.totalSale90dCnt),
    },
    first_seen: crawlDate(raw.firstCrawlDt),
    rating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
    review_count: toCount(raw.reviewCount),
    fetched_at: fetchedAt,
  };
}

/** Données d'une vidéo lue par son lien (batchVideoDetail) : seulement ce que la source donne. */
export interface VideoFacts {
  description: string;
  duration_s: number | null;
  views: number | null;
  likes: number | null;
  shares: number | null;
  sales: number | null;
  published_at: string | null;
  /** Compte TikTok (« @nom »), absent des anciennes analyses. */
  author?: string | null;
  comments?: number | null;
  /** Couverture servie par la source (domaine autorisé), sinon null. */
  cover_url?: string | null;
}

export function mapNexscopeVideoFacts(raw: Record<string, unknown>): VideoFacts {
  const author = text(raw.uniqueId).replace(/^@/, '');
  return {
    description: repairAccents(text(raw.videoDesc)),
    duration_s: toCount(raw.duration),
    views: toCount(raw.totalViewsCnt),
    likes: toCount(raw.totalDiggCnt),
    shares: toCount(raw.totalSharesCnt),
    sales: toCount(raw.totalVideoSaleCnt),
    published_at: /^(\d{4}-\d{2}-\d{2})/.exec(text(raw.createDate))?.[1] ?? null,
    author: author ? `@${author}` : null,
    comments: toCount(raw.totalCommentsCnt),
    cover_url: checkImage(text(raw.coverUrl)).image || null,
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
    return this.post(`${NEXSCOPE_API_BASE}/${slug}/run`, slug, body);
  }

  private post(url: string, cacheName: string, body: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    this.assertConfigured();
    const payload = JSON.stringify(body);
    return this.client.request({
      url,
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.nexscopeApiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: payload,
      cacheKey: `${cacheName}|${payload}`,
      timeoutMs,
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
            const result = mapNexscopeProduct(raw as NexscopeDiscoveryProduct, niche, query.country);
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

  /**
   * Recherche par mot-clé (bloc 1, à la demande) : même route que le relevé de nuit, tiktok-product-discovery, avec son
   * paramètre documenté `keyword` (« fuzzy matching of product titles »), pays demandé, tri sur les ventes 7 jours,
   * une page de 10 produits (11 à 22 crédits). Renvoie les produits bruts ; la lecture est dans lib/radar/keyword-search.ts.
   */
  async searchProducts(keyword: string, region: string): Promise<Record<string, unknown>[]> {
    const json = await this.run(NEXSCOPE_SLUGS.discovery, {
      keyword,
      region,
      orderField: 'day7_units_sold',
      page: 1,
      pageSize: PAGE_SIZE,
    });
    return findList(json, 'products') ?? [];
  }

  async fetchProductHistory(_productId: string, _days: number, _endDate?: string): Promise<SalesPoint[]> {
    // Pas de série jour par jour pour TikTok chez Nexscope : nos instantanés quotidiens prennent le relais.
    return [];
  }

  /** Les 5 vidéos qui vendent le plus ce produit (tri par ventes de la vidéo chez Nexscope, 10 demandées). */
  async fetchTopVideos(productId: string): Promise<TopVideo[]> {
    const json = await this.post(`${NEXSCOPE_ET_BASE}/listProductVideo`, 'et-listProductVideo', {
      productId: sourceProductId(productId),
      productVideoSortField: 4,
      sortType: 1,
      pageNum: 1,
      pageSize: 10,
    });
    // Vraie réponse : { code, data: { total, data: [vidéos], columns, type } }.
    const list = findList(json, 'data') ?? [];
    return list
      .map(mapNexscopeVideo)
      .filter((v): v is TopVideo => v !== null)
      .sort((a, b) => (b.estimated_sales ?? 0) - (a.estimated_sales ?? 0))
      .slice(0, 5);
  }

  /**
   * Une vidéo TikTok à partir de son identifiant (data-et-batch-video-detail, `videoIds`), 10 crédits. null si la source
   * ne la connaît pas.
   */
  async fetchVideoDetail(videoId: string): Promise<VideoFacts | null> {
    // Par identifiant (paramètre `videoIds` documenté) : le nom du compte dans le lien peut avoir changé.
    const json = await this.post(`${NEXSCOPE_ET_BASE}/batchVideoDetail`, 'et-batchVideoDetail', { videoIds: [videoId] });
    const raw = (findList(json, 'videos') ?? [])[0];
    return raw ? mapNexscopeVideoFacts(raw) : null;
  }

  async fetchProductDetails(productIds: string[]): Promise<Map<string, ProductDetails>> {
    const result = new Map<string, ProductDetails>();
    const fetchedAt = new Date().toISOString();
    for (let i = 0; i < productIds.length; i += DETAIL_BATCH) {
      const batch = productIds.slice(i, i + DETAIL_BATCH);
      const ours = new Map(batch.map((id) => [sourceProductId(id), id]));
      const ids = [...ours.keys()];
      const json = await this.post(`${NEXSCOPE_ET_BASE}/batchProductDetail`, 'et-batchProductDetail', { productIds: ids }, DETAIL_TIMEOUT_MS);
      for (const raw of findList(json, 'products') ?? []) {
        const details = mapNexscopeDetails(raw, fetchedAt);
        const id = ours.get(String(raw.productId));
        if (details && id) result.set(id, details);
      }
    }
    return result;
  }
}
