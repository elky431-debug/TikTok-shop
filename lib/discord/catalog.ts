import { getLiveCatalog, type LiveCatalog } from '@/lib/catalog';
import type { Repo } from '@/lib/db';
import type { Product, Profile, RegionId } from '@/lib/db/types';
import { isPaidPlan } from '@/lib/plans';
import { rankForUser, visibleProductIds } from '@/lib/radar-rules';
import { regionFor } from '@/lib/regions';
import { displayName } from '@/lib/product-name';

/**
 * Catalogue vu depuis Discord, avec exactement les règles de l'appli (lib/radar.ts) :
 * - abonnés (Starter, Pro, Elite) : tout le catalogue du jour ;
 * - sans abonnement : ses 3 produits du jour (les meilleurs de ses niches) et ceux qu'il suit déjà. Les autres ne
 *   sortent jamais, pas même leur nom dans l'autocomplétion.
 * Le catalogue est gardé 2 minutes en mémoire : l'autocomplétion interroge à chaque lettre tapée, et Discord
 * attend une réponse en moins de 3 secondes.
 */
const TTL_MS = 2 * 60_000;
const cache = new WeakMap<Repo, Map<RegionId, { at: number; catalog: LiveCatalog }>>();

export async function discordCatalog(repo: Repo, region: RegionId = 'FR', now = new Date()): Promise<LiveCatalog> {
  let byRegion = cache.get(repo);
  if (!byRegion) {
    byRegion = new Map();
    cache.set(repo, byRegion);
  }
  const hit = byRegion.get(region);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.catalog;
  const catalog = await getLiveCatalog(repo, now, region);
  byRegion.set(region, { at: Date.now(), catalog });
  return catalog;
}

/** Tests : oublie le catalogue gardé en mémoire pour ce dépôt. */
export function forgetDiscordCatalog(repo: Repo) {
  cache.delete(repo);
}

/** Produits que ce compte peut ouvrir aujourd'hui (même règle que l'appli). */
export async function accessibleProducts(profile: Profile, repo: Repo, now = new Date()): Promise<{ catalog: LiveCatalog; products: Product[] }> {
  const catalog = await discordCatalog(repo, regionFor(profile), now);
  if (isPaidPlan(profile.plan)) return { catalog, products: catalog.products };
  const ranked = rankForUser(catalog.products, profile.niches);
  const visible = visibleProductIds(ranked, profile.plan);
  const saved = new Set((await repo.listSavedProducts(profile.id)).map((s) => s.product_id));
  return { catalog, products: catalog.products.filter((p) => visible.has(p.id) || saved.has(p.id)) };
}

export const normalizeSearch = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Recherche par nom : début de nom d'abord, puis mots contenus, puis score. 25 au plus (limite de Discord). */
export function searchProducts(products: Product[], query: string, limit = 25): Product[] {
  const q = normalizeSearch(query);
  const scored = products
    .map((p) => {
      const name = normalizeSearch(`${displayName(p)} ${p.name}`);
      if (!q) return { p, rank: 2 };
      if (name.startsWith(q)) return { p, rank: 0 };
      if (q.split(' ').every((word) => name.includes(word))) return { p, rank: 1 };
      return null;
    })
    .filter((x): x is { p: Product; rank: number } => x !== null);
  return scored
    .sort((a, b) => a.rank - b.rank || b.p.latest_score - a.p.latest_score || a.p.id.localeCompare(b.p.id))
    .slice(0, limit)
    .map((x) => x.p);
}

/** Retrouve le produit choisi : l'identifiant donné par l'autocomplétion, sinon le texte tapé. */
export function findProduct(products: Product[], value: string): Product | null {
  return products.find((p) => p.id === value) ?? searchProducts(products, value, 1)[0] ?? null;
}

/** Choix d'autocomplétion : nom (100 caractères au plus), valeur = identifiant du produit. */
export function autocompleteChoices(products: Product[]): Array<{ name: string; value: string }> {
  return products.map((p) => ({ name: displayName(p).slice(0, 100), value: p.id.slice(0, 100) }));
}
