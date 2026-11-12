import { getRepo, type Repo } from '@/lib/db';
import type { Product } from '@/lib/db/types';

/**
 * Catalogue montré aux utilisateurs. Règle : jamais de produits fictifs présentés comme réels.
 *  - S'il existe des produits d'une source réelle, seuls eux sont montrés (leur dernier relevé), même si une
 *    nuit en échec a rempli la base de données fictives en repli.
 *  - Sinon, les produits fictifs sont montrés avec la mention « produits fictifs » (`demo`).
 *  - Si le dernier relevé a plus de 36 heures, l'affichage dit « Données du [date] » (`stale`).
 */

export const STALE_AFTER_HOURS = 36;

export interface LiveCatalog {
  products: Product[];
  /** Produits fictifs (démonstration) : à signaler partout où ils apparaissent. */
  demo: boolean;
  /** Source des produits montrés (mock, tiktok, nexscope…). */
  provider: string | null;
  /** Jour du relevé (AAAA-MM-JJ, heure de Paris). */
  dataDate: string | null;
  /** Heure du dernier rafraîchissement. */
  refreshedAt: string | null;
  /** Relevé de plus de 36 heures. */
  stale: boolean;
}

export const isDemoProduct = (product: Pick<Product, 'provider'>) => product.provider === 'mock';

export function selectLiveCatalog(all: Product[], now: Date = new Date()): LiveCatalog {
  const real = all.filter((p) => !isDemoProduct(p));
  const pool = real.length ? real : all;
  const dataDate = pool.reduce<string | null>((max, p) => (p.snapshot_date && (!max || p.snapshot_date > max) ? p.snapshot_date : max), null);
  const products = pool.filter((p) => p.snapshot_date === dataDate);
  const refreshedAt = products.reduce<string | null>((max, p) => (!max || p.updated_at > max ? p.updated_at : max), null);
  const ageHours = refreshedAt ? (now.getTime() - Date.parse(refreshedAt)) / 3_600_000 : 0;
  return {
    products,
    demo: products.length > 0 && products.every(isDemoProduct),
    provider: products[0]?.provider ?? null,
    dataDate,
    refreshedAt,
    stale: ageHours > STALE_AFTER_HOURS,
  };
}

export async function getLiveCatalog(repo: Repo = getRepo()): Promise<LiveCatalog> {
  return selectLiveCatalog(await repo.listProducts());
}
