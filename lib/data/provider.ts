import type { ProductDetails, RegionId, TopVideo } from '@/lib/db/types';
import type { NicheId } from '@/lib/niches';

/**
 * Interface unique pour toutes les sources de données produits.
 * Règle absolue : uniquement des API officielles ou un fournisseur sous contrat.
 * Jamais de scraping de TikTok, jamais de connexion aux comptes des utilisateurs.
 *
 * Une source réelle ne fournit pas tout : un champ inconnu vaut `null`, jamais une valeur inventée.
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
  /** Créateurs affiliés qui font la promotion du produit ; null = la source ne le dit pas. */
  active_affiliates: number | null;
  /** URL https d'une image autorisée (voir config/image-hosts.mjs), ou '' pour le visuel générique. */
  image_url: string;
  /** Ventes estimées sur la journée demandée ; null = inconnues. */
  estimated_sales: number | null;
  /** Compteur cumulé de ventes (permet de déduire les ventes du jour d'une nuit à l'autre) ; null = inconnu. */
  units_sold_total?: number | null;
  /** Ventes des 7 derniers jours et des 7 jours d'avant, quand la source donne des cumuls par période. */
  sales_windows?: { last7: number; prev7: number } | null;
}

export interface SalesPoint {
  date: string; // AAAA-MM-JJ
  estimated_sales: number | null;
  affiliates: number | null;
}

export interface TrendingQuery {
  /** Pays du catalogue (FR par défaut ; DE, IT, ES si ENABLED_REGIONS les active). */
  country: RegionId;
  category?: NicheId;
  /** Jour demandé (AAAA-MM-JJ, heure de Paris). */
  date: string;
}

/** Compteurs d'une exécution, affichés dans l'écran admin. */
export interface ProviderRunStats {
  calls: number;
  cacheHits: number;
  retries: number;
  budget: number;
  budgetReached: boolean;
  /** Produits écartés (prix absent, autre devise, autre pays, niche inconnue…). */
  skipped: number;
  /** Hôtes d'images refusés parce qu'absents de la liste autorisée (à ajouter dans IMAGE_HOSTS si légitimes). */
  rejectedImageHosts: string[];
}

export interface ProductDataProvider {
  readonly name: 'mock' | 'tiktok' | 'nexscope';
  /** Produits du jour (ouverts à l'affiliation) pour la France. */
  fetchTrendingProducts(query: TrendingQuery): Promise<ProviderProduct[]>;
  /** Historique des ventes estimées, du plus ancien au plus récent, terminant à `endDate` (inclus). [] = pas d'historique. */
  fetchProductHistory(productId: string, days: number, endDate?: string): Promise<SalesPoint[]>;
  /** Vidéos qui vendent le plus ce produit. [] = la source n'en fournit pas. */
  fetchTopVideos(productId: string): Promise<TopVideo[]>;
  /**
   * Ventes par période (1 à 90 jours), note et avis, pour plusieurs produits à la fois. Facultatif : utilisé tant que
   * nos relevés quotidiens d'un produit sont trop courts pour tracer sa courbe.
   */
  fetchProductDetails?(productIds: string[], date: string): Promise<Map<string, ProductDetails>>;
  /** Compteurs de l'exécution en cours (fournisseurs réels seulement). */
  stats?(): ProviderRunStats;
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
