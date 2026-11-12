import { createHmac } from 'node:crypto';
import type { TopVideo } from '@/lib/db/types';
import { env } from '@/lib/env';
import type { NicheId } from '@/lib/niches';
import type { ProductDataProvider, ProviderProduct, SalesPoint, TrendingQuery } from './provider';
import { ProviderConfigError } from './provider';

/**
 * Squelette prêt à brancher sur les API officielles TikTok Shop (programme affiliés, Partner Center).
 * Aucun scraping, aucune connexion au compte TikTok de l'utilisateur : l'accès passe par une
 * application partenaire autorisée (app key / app secret + jeton OAuth du compte autorisé).
 *
 * Documentation : https://partner.tiktokshop.com/docv2 (section « Affiliate Creator »).
 */

const API_BASE = 'https://open-api.tiktokglobalshop.com';

// TODO(tiktok) : vérifier les versions exactes des chemins dans la documentation Partner Center
// au moment du branchement (elles sont datées, ex. 202405) et mettre à jour ces constantes.
const PATHS = {
  /** Recherche de produits ouverts à l'affiliation (catégorie, commission, mots-clés). */
  searchOpenProducts: '/affiliate_creator/202405/open_collaborations/products/search',
  /** Commandes affiliées (pour mesurer ce qui se vend réellement via les créateurs). */
  searchAffiliateOrders: '/affiliate_creator/202410/orders/search',
};

// TODO(tiktok) : remplacer par les identifiants de catégories TikTok Shop France (catalogue officiel).
const CATEGORY_IDS: Record<NicheId, string> = {
  beaute: 'TODO_CATEGORIE_BEAUTE',
  maison: 'TODO_CATEGORIE_MAISON',
  mode: 'TODO_CATEGORIE_MODE',
  tech: 'TODO_CATEGORIE_TECH',
  sport: 'TODO_CATEGORIE_SPORT',
  animaux: 'TODO_CATEGORIE_ANIMAUX',
  bebe: 'TODO_CATEGORIE_BEBE',
};

/**
 * Signature des requêtes : HMAC-SHA256(app_secret, app_secret + chemin + paramètres triés + corps + app_secret).
 * TODO(tiktok) : confirmer l'algorithme dans la doc « Sign your API request » avant la mise en production.
 */
export function signTikTokRequest(path: string, params: Record<string, string>, body: string, secret: string): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'access_token')
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return createHmac('sha256', secret).update(`${secret}${path}${sorted}${body}${secret}`).digest('hex');
}

export class TikTokProvider implements ProductDataProvider {
  readonly name = 'tiktok' as const;

  private assertConfigured() {
    const missing = [
      !env.tiktokAppKey && 'TIKTOK_APP_KEY',
      !env.tiktokAppSecret && 'TIKTOK_APP_SECRET',
      !env.tiktokAccessToken && 'TIKTOK_ACCESS_TOKEN',
    ].filter(Boolean) as string[];
    if (missing.length) throw new ProviderConfigError('tiktok', missing);
  }

  private async call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    this.assertConfigured();
    const params: Record<string, string> = {
      app_key: env.tiktokAppKey,
      timestamp: String(Math.floor(Date.now() / 1000)),
      page_size: '50',
    };
    const payload = JSON.stringify(body);
    params.sign = signTikTokRequest(path, params, payload, env.tiktokAppSecret);
    const url = `${API_BASE}${path}?${new URLSearchParams(params).toString()}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tts-access-token': env.tiktokAccessToken },
      body: payload,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`API TikTok Shop : HTTP ${response.status} sur ${path}`);
    const json = (await response.json()) as { code: number; message: string; data: T };
    if (json.code !== 0) throw new Error(`API TikTok Shop : ${json.message} (code ${json.code})`);
    return json.data;
  }

  async fetchTrendingProducts(query: TrendingQuery): Promise<ProviderProduct[]> {
    this.assertConfigured();
    const niches = query.category ? [query.category] : (Object.keys(CATEGORY_IDS) as NicheId[]);
    const results: ProviderProduct[] = [];
    for (const niche of niches) {
      // TODO(tiktok) : paginer (page_token) et ajuster les filtres (commission minimale, région FR).
      const data = await this.call<{ products?: Array<Record<string, unknown>> }>(PATHS.searchOpenProducts, {
        category: { id: CATEGORY_IDS[niche] },
        sort_by: 'sales_volume',
        region: query.country,
      });
      for (const raw of data.products ?? []) {
        // TODO(tiktok) : adapter le mapping aux champs réels de la réponse (noms et unités).
        results.push({
          id: `tts-${String(raw.id)}`,
          name: String(raw.title ?? ''),
          niche,
          description: '',
          shop_name: String((raw.shop as { name?: string } | undefined)?.name ?? ''),
          price_cents: Math.round(Number((raw.price as { amount?: string } | undefined)?.amount ?? 0) * 100),
          commission_rate: Number((raw.commission as { rate?: number } | undefined)?.rate ?? 0) / 10_000,
          free_sample: Boolean(raw.has_free_sample ?? false),
          active_affiliates: Number(raw.creator_count ?? 0),
          image_url: String((raw.main_image as { url?: string } | undefined)?.url ?? ''),
          estimated_sales: Number(raw.sales ?? 0),
        });
      }
    }
    return results;
  }

  async fetchProductHistory(_productId: string, _days: number, _endDate?: string): Promise<SalesPoint[]> {
    this.assertConfigured();
    // TODO(tiktok) : l'API affiliés ne fournit pas d'historique de ventes par produit.
    // Deux options : (1) agréger nos propres instantanés quotidiens (table product_snapshots),
    // déjà alimentés chaque nuit ; (2) compléter avec un fournisseur payant (voir NexscopeProvider).
    // Renvoyer [] fait retomber le calcul de croissance sur nos instantanés.
    return [];
  }

  async fetchTopVideos(_productId: string): Promise<TopVideo[]> {
    this.assertConfigured();
    // TODO(tiktok) : pas d'endpoint officiel public listant les vidéos les plus vendeuses d'un
    // produit. À alimenter via un fournisseur de données payant, jamais par scraping.
    return [];
  }
}
