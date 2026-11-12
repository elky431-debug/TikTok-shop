import type { TopVideo } from '@/lib/db/types';
import type { NicheId } from '@/lib/niches';

/**
 * Interface unique pour toutes les sources de données produits.
 * Règle absolue : uniquement des API officielles ou un fournisseur payant.
 * Jamais de scraping de TikTok, jamais de connexion aux comptes des utilisateurs.
 */

export interface ProviderProduct {
  id: string;
  name: string;
  niche: NicheId;
  description: string;
  shop_name: string;
  price_cents: number;
  /** Taux de commission affilié, entre 0 et 1. */
  commission_rate: number;
  free_sample: boolean;
  active_affiliates: number;
  image_url: string;
  /** Ventes estimées sur la journée demandée. */
  estimated_sales: number;
}

export interface SalesPoint {
  date: string; // AAAA-MM-JJ
  estimated_sales: number;
  affiliates: number;
}

export interface TrendingQuery {
  country: 'FR';
  category?: NicheId;
  /** Jour demandé (AAAA-MM-JJ, heure de Paris). */
  date: string;
}

export interface ProductDataProvider {
  readonly name: 'mock' | 'tiktok' | 'nexscope';
  /** Produits du jour (ouverts à l'affiliation) pour la France. */
  fetchTrendingProducts(query: TrendingQuery): Promise<ProviderProduct[]>;
  /** Historique des ventes estimées, du plus ancien au plus récent, terminant à `endDate` (inclus). */
  fetchProductHistory(productId: string, days: number, endDate?: string): Promise<SalesPoint[]>;
  /** Vidéos qui vendent le plus ce produit. */
  fetchTopVideos(productId: string): Promise<TopVideo[]>;
}

export class ProviderConfigError extends Error {
  constructor(provider: string, missing: string[]) {
    super(
      `Fournisseur « ${provider} » non configuré : renseigne ${missing.join(', ')} dans .env.local, ` +
        'ou repasse DATA_PROVIDER=mock pour utiliser les données fictives.',
    );
    this.name = 'ProviderConfigError';
  }
}
