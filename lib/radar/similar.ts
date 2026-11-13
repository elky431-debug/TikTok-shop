import type { Product } from '@/lib/db/types';
import { categoryPath, subcategoryOf } from './metrics';

/**
 * Produits proches (fiche produit, bloc 3), pris dans le catalogue du jour du même pays (module pur) :
 *  - similaires : même sous-catégorie TikTok Shop (deuxième niveau), sinon même niche si la source ne donne pas de catégorie ;
 *  - même boutique : même nom de boutique (non vide), à la casse et aux espaces près.
 * Triés par score du jour. Un produit sans boutique connue n'a pas de section « même boutique ».
 */
export interface SimilarResult {
  basis: 'souscat' | 'niche';
  label: string;
  products: Product[];
}

const byScore = (a: Product, b: Product) => b.latest_score - a.latest_score || a.id.localeCompare(b.id);
const normShop = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

export function similarProducts(product: Product, catalog: Product[], limit = 4): SimilarResult {
  const sub = subcategoryOf(categoryPath(product.description));
  const others = catalog.filter((p) => p.id !== product.id);
  if (sub) {
    const same = others.filter((p) => subcategoryOf(categoryPath(p.description))?.toLowerCase() === sub.toLowerCase());
    return { basis: 'souscat', label: sub, products: same.sort(byScore).slice(0, limit) };
  }
  return { basis: 'niche', label: product.niche, products: others.filter((p) => p.niche === product.niche).sort(byScore).slice(0, limit) };
}

export function sameShopProducts(product: Product, catalog: Product[], limit = 4): Product[] {
  const shop = normShop(product.shop_name ?? '');
  if (!shop) return [];
  return catalog
    .filter((p) => p.id !== product.id && normShop(p.shop_name ?? '') === shop)
    .sort(byScore)
    .slice(0, limit);
}
