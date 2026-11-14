import type { Repo } from '@/lib/db';
import type { Product, Profile } from '@/lib/db/types';
import type { NicheId } from '@/lib/niches';
import { heuristicShortName } from '@/lib/product-name';
import { regionFor } from '@/lib/regions';
import { dailyScale, scoreOne, trendFor } from '@/lib/score';
import { SEARCH_KIND, type KeywordResult, type SearchRecord } from './keyword-search';

/**
 * Produits trouvés par la recherche : chaque résultat peut devenir une vraie fiche produit, à la volée, à partir des seules
 * données déjà reçues de la source (aucun nouvel appel payant). Le score est calculé avec la même formule que le radar,
 * sans la croissance (la source ne la donne pas pour une recherche : son poids est réparti sur les autres critères,
 * comme pour tout critère absent), puis placé sur l'échelle du jour (15 à 90). Ces fiches n'entrent pas dans le radar :
 * elles n'ont pas de relevé du jour (`snapshot_date` vide).
 */

/** Échelle du jour : les points bruts du catalogue → score affiché de 15 à 90. */
export function scaleFromCatalog(catalog: Array<Pick<Product, 'latest_breakdown' | 'latest_score'>>): (raw: number) => number {
  return dailyScale(catalog.map((p) => p.latest_breakdown?.raw ?? p.latest_score));
}

function breakdownFor(r: KeywordResult, niche: NicheId) {
  // Moyenne des 7 derniers jours = ventes 7 jours / 7 (chiffre de la source) : sert au critère « concurrence ».
  const daily = r.sales_7d !== null ? r.sales_7d / 7 : null;
  return scoreOne(
    {
      id: r.id,
      niche,
      price_cents: r.price_cents,
      commission_rate: r.commission_rate,
      affiliates: r.affiliates,
      sales: daily !== null ? Array.from({ length: 7 }, () => daily) : [],
      windows: null,
    },
    0,
    null,
  );
}

/** Score affiché d'un résultat de recherche, sur l'échelle du jour. */
export function searchScore(r: KeywordResult, scale: (raw: number) => number): number {
  const breakdown = breakdownFor(r, r.niche ?? 'maison');
  return scale(breakdown.raw ?? breakdown.total);
}

/** Fiche produit complète construite à partir d'un résultat de recherche. */
export function productFromResult(r: KeywordResult, opts: { region: Product['region']; scale: (raw: number) => number; now?: Date }): Product {
  const niche = r.niche ?? 'maison';
  const breakdown = breakdownFor(r, niche);
  breakdown.total = opts.scale(breakdown.raw ?? breakdown.total);
  const now = (opts.now ?? new Date()).toISOString();
  return {
    id: r.id,
    provider: 'nexscope',
    name: r.name,
    short_name: r.short_name ?? heuristicShortName(r.name),
    niche_checked: Boolean(r.niche_checked),
    niche,
    description: r.category.length ? `Catégorie TikTok Shop : ${r.category.join(' › ')}` : '',
    shop_name: r.shop_name,
    price_cents: r.price_cents,
    commission_rate: r.commission_rate,
    active_affiliates: r.affiliates,
    image_url: r.image_url,
    top_videos: [],
    videos_fetched_at: null,
    details: {
      // Seuls les cumuls donnés par la source ; la période de 28 jours ne passe pas pour 30.
      sales: { d1: null, d7: r.sales_7d, d15: null, d30: null, d60: null, d90: null },
      first_seen: null,
      rating: r.rating,
      review_count: r.review_count,
      fetched_at: now,
      price_min_cents: r.price_min_cents,
      price_max_cents: r.price_max_cents,
    },
    region: opts.region,
    // Pas de relevé du jour : la fiche existe, mais le produit n'entre pas dans le radar.
    snapshot_date: null,
    latest_score: breakdown.total,
    latest_breakdown: breakdown,
    trend: trendFor(null),
    growth_7d: 0,
    sales_30d: [],
    updated_at: now,
  };
}

/** Dernier résultat de recherche de cet utilisateur pour ce produit (sa propre recherche, jamais celle d'un autre). */
export async function findSearchResult(repo: Repo, userId: string, productId: string): Promise<KeywordResult | null> {
  const records = await repo.listRecords<SearchRecord>(userId, SEARCH_KIND);
  for (const record of records) {
    const hit = record.data.results?.find((r) => r.id === productId);
    if (hit) return hit;
  }
  return null;
}

/**
 * Produit d'un résultat de recherche : celui de la base s'il existe déjà (jamais écrasé : le relevé de nuit reste la
 * référence), sinon une fiche créée à partir du résultat. null si ce produit n'est pas dans les recherches de la personne.
 */
export async function ensureSearchProduct(
  repo: Repo,
  profile: Pick<Profile, 'id' | 'region'>,
  productId: string,
  catalog: Array<Pick<Product, 'latest_breakdown' | 'latest_score'>>,
): Promise<Product | null> {
  const existing = await repo.getProduct(productId);
  if (existing) return existing;
  const result = await findSearchResult(repo, profile.id, productId);
  if (!result) return null;
  const product = productFromResult(result, { region: regionFor(profile as Profile), scale: scaleFromCatalog(catalog) });
  await repo.upsertProducts([product]);
  return (await repo.getProduct(productId)) ?? product;
}
