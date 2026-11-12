import type { TopVideo } from '@/lib/db/types';
import { env } from '@/lib/env';
import type { ProductDataProvider, ProviderProduct, SalesPoint, TrendingQuery } from './provider';
import { ProviderConfigError } from './provider';

/**
 * Squelette pour un fournisseur de données tiers payant (recherche par mot-clé et région).
 * Même principe que TikTokProvider : clé d'API, aucune donnée récupérée par scraping de notre part.
 *
 * TODO(nexscope) : confirmer l'URL de base, l'authentification et le format exact des réponses
 * avec la documentation fournie lors de la souscription.
 */

const API_BASE = process.env.NEXSCOPE_API_URL || 'https://api.nexscope.ai/v1';

const NICHE_KEYWORDS: Record<string, string> = {
  beaute: 'beauté soin visage maquillage',
  maison: 'maison cuisine rangement',
  mode: 'mode vêtements accessoires',
  tech: 'accessoires téléphone gadget',
  sport: 'sport fitness bien-être',
  animaux: 'chien chat animaux',
  bebe: 'bébé puériculture',
};

export class NexscopeProvider implements ProductDataProvider {
  readonly name = 'nexscope' as const;

  private assertConfigured() {
    if (!env.nexscopeApiKey) throw new ProviderConfigError('nexscope', ['NEXSCOPE_API_KEY']);
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    this.assertConfigured();
    const url = `${API_BASE}${path}?${new URLSearchParams(params).toString()}`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${env.nexscopeApiKey}`, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Nexscope : HTTP ${response.status} sur ${path}`);
    return (await response.json()) as T;
  }

  async fetchTrendingProducts(query: TrendingQuery): Promise<ProviderProduct[]> {
    const niches = query.category ? [query.category] : Object.keys(NICHE_KEYWORDS);
    const results: ProviderProduct[] = [];
    for (const niche of niches) {
      // TODO(nexscope) : chemin et paramètres réels de la recherche (mot-clé, région, tri par ventes).
      const data = await this.get<{ items?: Array<Record<string, unknown>> }>('/tiktok-shop/products/search', {
        keyword: NICHE_KEYWORDS[niche],
        region: query.country,
        date: query.date,
        sort: 'sales_7d',
      });
      for (const raw of data.items ?? []) {
        // TODO(nexscope) : adapter le mapping aux champs réels.
        results.push({
          id: `nx-${String(raw.id)}`,
          name: String(raw.title ?? ''),
          niche: niche as ProviderProduct['niche'],
          description: String(raw.description ?? ''),
          shop_name: String(raw.shop_name ?? ''),
          price_cents: Math.round(Number(raw.price ?? 0) * 100),
          commission_rate: Number(raw.commission_rate ?? 0),
          free_sample: Boolean(raw.free_sample ?? false),
          active_affiliates: Number(raw.affiliates ?? 0),
          image_url: String(raw.image ?? ''),
          estimated_sales: Number(raw.sales_1d ?? 0),
        });
      }
    }
    return results;
  }

  async fetchProductHistory(productId: string, days: number, endDate?: string): Promise<SalesPoint[]> {
    // TODO(nexscope) : chemin réel de l'historique.
    const data = await this.get<{ points?: Array<{ date: string; sales: number; affiliates?: number }> }>(
      `/tiktok-shop/products/${encodeURIComponent(productId.replace(/^nx-/, ''))}/history`,
      { days: String(days), ...(endDate ? { end: endDate } : {}) },
    );
    return (data.points ?? []).map((p) => ({
      date: p.date,
      estimated_sales: p.sales,
      affiliates: p.affiliates ?? 0,
    }));
  }

  async fetchTopVideos(productId: string): Promise<TopVideo[]> {
    // TODO(nexscope) : chemin réel des vidéos les plus vendeuses.
    const data = await this.get<{ videos?: Array<Record<string, unknown>> }>(
      `/tiktok-shop/products/${encodeURIComponent(productId.replace(/^nx-/, ''))}/videos`,
      { sort: 'sales', limit: '5' },
    );
    return (data.videos ?? []).map((v) => ({
      title: String(v.title ?? ''),
      views: Number(v.views ?? 0),
      estimated_sales: Number(v.sales ?? 0),
      hook: v.hook ? String(v.hook) : null,
      format: String(v.format ?? 'Vidéo'),
    }));
  }
}
