import { createHmac } from 'node:crypto';
import type { TopVideo } from '@/lib/db/types';
import { env } from '@/lib/env';
import { NICHE_IDS, isNicheId, type NicheId } from '@/lib/niches';
import { checkImage, nicheFromCategories, toCents, toCount, type MapResult } from './classify';
import { BudgetExceededError, ProviderClient, ProviderHttpError, httpError, type CacheStore, type RawResponse } from './http';
import type { ProductDataProvider, ProviderProduct, ProviderRunStats, SalesPoint, TrendingQuery } from './provider';
import { ProviderConfigError } from './provider';

/**
 * API officielle TikTok Shop (Partner Center), côté créateur affilié.
 * Aucun scraping, aucune connexion au compte TikTok de l'utilisateur : l'appli partenaire appelle l'API avec
 * sa clé, sa signature et le jeton d'un compte créateur qui l'a autorisée (TIKTOK_ACCESS_TOKEN).
 *
 * Documentation lue (copies datées des pages officielles, le site n'étant pas joignable d'ici) :
 *  - « Search Open Collaboration Products » (mise à jour 2026-10-13) :
 *    https://partner.tiktokshop.com/docv2/page/search-open-collaboration-products-202405
 *  - « Sign your API request » et « Common parameters » :
 *    https://partner.tiktokshop.com/docv2/page/sign-your-api-request
 *  - « Affiliate Creator API overview » (2026-09-21) : « Affiliate APIs are currently not available in the
 *    UK and EU markets. » ⇒ pour la France, l'accès dépend d'une ouverture par TikTok (voir DECISIONS.md).
 *
 * Ce que l'API ne fournit pas (laissé vide, jamais inventé) : nombre d'affiliés, échantillon gratuit
 * (seulement par créateur, via un autre point d'accès), historique des ventes, vidéos qui vendent.
 * `units_sold` est un cumul, absent si le créateur n'a pas autorisé le partage précis des données :
 * les ventes du jour se déduisent alors d'une nuit à l'autre.
 */

export const TIKTOK_API_BASE = 'https://open-api.tiktokglobalshop.com';
export const TIKTOK_PATHS = {
  searchOpenCollaborationProducts: '/affiliate_creator/202405/open_collaborations/products/search',
} as const;

/** Taille de page maximum autorisée par la documentation (1 à 20). */
const PAGE_SIZE = 20;
/** Codes métier « trop de requêtes » (page « Rate limits ») : rejoués après attente. */
const RATE_LIMIT_CODES = new Set([36009002]);
/** Jeton créateur invalide, expiré ou sans le bon droit (page « Authorization overview »). */
const TOKEN_CODES: Record<number, string> = {
  105001: 'jeton créateur invalide ou autorisation retirée',
  105002: 'jeton créateur expiré',
  105005: 'droit « creator.affiliate_collaboration.read » manquant',
};

/**
 * Signature (doc « Sign your API request ») : paramètres de requête triés sauf `sign` et `access_token`,
 * concaténés en {clé}{valeur}, précédés du chemin, suivis du corps exact (hors multipart), entourés du
 * secret, puis HMAC-SHA256 avec le secret, en hexadécimal minuscule.
 */
export function signTikTokRequest(path: string, params: Record<string, string>, body: string, secret: string): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'access_token')
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return createHmac('sha256', secret).update(`${secret}${path}${sorted}${body}${secret}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Réponse documentée et correspondance avec le modèle `products`
// ---------------------------------------------------------------------------

interface TikTokPrice {
  currency?: string;
  minimum_amount?: string;
  maximum_amount?: string;
}

export interface TikTokOpenProduct {
  id?: string;
  title?: string;
  main_image_url?: string;
  detail_link?: string;
  sale_region?: string;
  has_inventory?: boolean;
  units_sold?: number;
  shop?: { name?: string };
  original_price?: TikTokPrice;
  sales_price?: TikTokPrice;
  category_chains?: Array<{ id?: string; local_name?: string; is_leaf?: boolean; parent_id?: string }>;
  commission?: { rate?: number; currency?: string; amount?: string };
}

export interface TikTokSearchData {
  products?: TikTokOpenProduct[];
  next_page_token?: string;
  total_count?: number;
}

/** Catégories de la plus générale à la plus précise (premier niveau = parent absent ou « 0 »). */
function orderedCategories(raw: TikTokOpenProduct): string[] {
  const chain = raw.category_chains ?? [];
  const ids = new Set(chain.map((c) => c.id));
  const roots = chain.filter((c) => !c.parent_id || c.parent_id === '0' || !ids.has(c.parent_id));
  const rest = chain.filter((c) => !roots.includes(c));
  return [...roots, ...rest].map((c) => c.local_name ?? '').filter(Boolean);
}

export function mapTikTokProduct(raw: TikTokOpenProduct, niche?: NicheId | null): MapResult {
  if (!raw.id || !raw.title) return { ok: false, reason: 'identifiant ou titre absent' };
  if (raw.sale_region && raw.sale_region !== 'FR') return { ok: false, reason: `vendu hors de France (${raw.sale_region})` };
  if (raw.has_inventory === false) return { ok: false, reason: 'plus en stock' };
  const price = raw.sales_price?.minimum_amount ? raw.sales_price : raw.original_price;
  if (price?.currency && price.currency !== 'EUR') return { ok: false, reason: `devise ${price.currency}` };
  const priceCents = toCents(price?.minimum_amount);
  if (!priceCents) return { ok: false, reason: 'prix absent' };
  const rate = toCount(raw.commission?.rate);
  if (rate === null) return { ok: false, reason: 'commission absente' };
  const categories = orderedCategories(raw);
  const resolvedNiche = niche ?? nicheFromCategories(categories);
  if (!resolvedNiche) return { ok: false, reason: 'catégorie hors des niches suivies' };

  const { image, rejectedHost } = checkImage(raw.main_image_url);

  return {
    ok: true,
    product: {
      id: `tts-${raw.id}`,
      name: raw.title.trim().slice(0, 200),
      niche: resolvedNiche,
      description: categories.length ? `Catégorie TikTok Shop : ${categories.join(' › ')}` : '',
      shop_name: raw.shop?.name?.trim() ?? '',
      price_cents: priceCents,
      // Centièmes de pour cent : 3587 = 35,87 %.
      commission_rate: Math.min(1, rate / 10_000),
      free_sample: null,
      active_affiliates: null,
      image_url: image,
      estimated_sales: null,
      units_sold_total: toCount(raw.units_sold),
      sales_windows: null,
    },
    ...(rejectedHost ? { rejectedImageHost: rejectedHost } : {}),
  };
}

/** Lit l'enveloppe { code, message, data } ; lève une erreur précise sinon. */
export function parseTikTokResponse(response: RawResponse): TikTokSearchData {
  const json = (response.json ?? {}) as { code?: number; message?: string; data?: TikTokSearchData };
  if (response.status !== 200) throw httpError('API TikTok Shop', response, json.message);
  if (json.code !== 0) {
    const code = Number(json.code);
    if (RATE_LIMIT_CODES.has(code)) {
      throw new ProviderHttpError(`API TikTok Shop : trop de requêtes (code ${code})`, 429, true, response.retryAfterMs);
    }
    const reason = TOKEN_CODES[code] ?? json.message ?? 'réponse inattendue';
    throw new ProviderHttpError(`API TikTok Shop : ${reason} (code ${json.code ?? '?'})`, response.status, false);
  }
  return json.data ?? {};
}

/** « beaute:601450,maison:600001 » → niche → identifiant de catégorie de premier niveau. */
export function parseCategoryMap(value: string): Partial<Record<NicheId, string>> {
  const map: Partial<Record<NicheId, string>> = {};
  for (const pair of value.split(',')) {
    const [niche, id] = pair.split(':').map((s) => s?.trim());
    if (isNicheId(niche) && id && /^\d+$/.test(id)) map[niche] = id;
  }
  return map;
}

export interface TikTokProviderOptions {
  cache?: CacheStore;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class TikTokProvider implements ProductDataProvider {
  readonly name = 'tiktok' as const;
  private readonly client: ProviderClient;

  constructor(options: TikTokProviderOptions = {}) {
    this.client = new ProviderClient({
      provider: 'API TikTok Shop',
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
    const missing = [
      !env.tiktokAppKey && 'TIKTOK_APP_KEY',
      !env.tiktokAppSecret && 'TIKTOK_APP_SECRET',
      // Jeton d'un compte créateur (user_type = 1) qui a autorisé l'appli : voir lib/data/tiktok-creator.ts.
      !env.tiktokAccessToken && 'TIKTOK_ACCESS_TOKEN',
    ].filter(Boolean) as string[];
    if (missing.length) throw new ProviderConfigError('tiktok', missing);
  }

  private async searchPage(body: Record<string, unknown>, pageToken: string): Promise<TikTokSearchData> {
    const query: Record<string, string> = {
      page_size: String(PAGE_SIZE),
      sort_field: 'units_sold',
      sort_order: 'DESC',
      ...(pageToken ? { page_token: pageToken } : {}),
    };
    const payload = JSON.stringify(body);
    const path = TIKTOK_PATHS.searchOpenCollaborationProducts;
    // La signature est horodatée : elle est calculée à l'envoi, et n'entre jamais dans la clé de cache.
    const params: Record<string, string> = { app_key: env.tiktokAppKey, timestamp: String(Math.floor(Date.now() / 1000)), ...query };
    params.sign = signTikTokRequest(path, params, payload, env.tiktokAppSecret);
    return this.client.request({
      url: `${TIKTOK_API_BASE}${path}?${new URLSearchParams(params).toString()}`,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tts-access-token': env.tiktokAccessToken },
      body: payload,
      cacheKey: `${path}?${new URLSearchParams(query).toString()}|${payload}`,
      parse: parseTikTokResponse,
    });
  }

  /** Parcourt jusqu'à `pages` pages d'une recherche (mêmes filtres d'une page à l'autre, comme l'exige la doc). */
  private async collect(body: Record<string, unknown>, pages: number, niche: NicheId | null, into: Map<string, ProviderProduct>) {
    let token = '';
    for (let page = 0; page < pages; page++) {
      const data = await this.searchPage(body, token);
      for (const raw of data.products ?? []) {
        const result = mapTikTokProduct(raw, niche);
        if (!result.ok) {
          this.client.noteSkipped();
          continue;
        }
        if (result.rejectedImageHost) this.client.noteRejectedImageHost(result.rejectedImageHost);
        into.set(result.product.id, result.product);
      }
      token = data.next_page_token ?? '';
      if (!token) break;
    }
  }

  async fetchTrendingProducts(query: TrendingQuery): Promise<ProviderProduct[]> {
    this.assertConfigured();
    const found = new Map<string, ProviderProduct>();
    const categoryMap = parseCategoryMap(env.tiktokCategoryMap);
    const niches = query.category ? [query.category] : NICHE_IDS;
    const targeted = niches.filter((n) => categoryMap[n]);
    try {
      if (targeted.length) {
        // Une recherche par niche, filtrée sur sa catégorie de premier niveau (seul niveau accepté par l'API).
        for (const niche of targeted) {
          await this.collect({ category: { id: categoryMap[niche] } }, env.dataPagesPerNiche, niche, found);
        }
      } else {
        // TODO(tiktok) : identifiants des catégories de 1er niveau pour la France inconnus tant qu'aucun appel
        // réel n'a été fait (aucun point d'accès « catégories » côté créateur). En attendant TIKTOK_CATEGORY_MAP,
        // une recherche générale triée par ventes, puis classement par le nom de catégorie renvoyé.
        await this.collect({}, env.dataPagesPerNiche * niches.length, null, found);
      }
    } catch (error) {
      // Quota atteint en cours de route : on garde ce qui a déjà été lu.
      if (!(error instanceof BudgetExceededError) || found.size === 0) throw error;
    }
    return [...found.values()].filter((p) => niches.includes(p.niche));
  }

  async fetchProductHistory(_productId: string, _days: number, _endDate?: string): Promise<SalesPoint[]> {
    // L'API ne fournit pas d'historique : la croissance se calcule sur nos instantanés quotidiens.
    return [];
  }

  async fetchTopVideos(_productId: string): Promise<TopVideo[]> {
    // Aucun point d'accès officiel ne liste les vidéos qui vendent un produit. Jamais de scraping.
    return [];
  }
}
