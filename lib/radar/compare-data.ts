import { getLiveCatalog } from '@/lib/catalog';
import type { Repo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { scoresFor, toProductView, type ProductView } from '@/lib/radar';
import { getFavorites, getRadarSettings } from '@/lib/radar/settings';
import { readWhyNow } from '@/lib/radar/why-now';
import { regionFor } from '@/lib/regions';
import { MAX_COMPARE } from './compare';

/**
 * Produits du comparateur : les candidats (favoris, puis produits suivis) et ceux demandés, vus avec les droits du plan
 * (score masqué si le plan le masque). Partagé par la page et le verdict.
 */
export async function loadCompare(repo: Repo, profile: Profile, requested: string[]) {
  const region = regionFor(profile);
  const [favorites, saved, settings, catalog] = await Promise.all([
    getFavorites(profile.id, repo),
    repo.listSavedProducts(profile.id),
    getRadarSettings(profile.id, repo),
    getLiveCatalog(repo, new Date(), region),
  ]);
  const candidateIds = [...new Set([...favorites, ...saved.map((s) => s.product_id)])];
  const chosen = (requested.length ? requested : favorites.slice(0, 2)).slice(0, MAX_COMPARE);
  const products = await repo.getProducts([...new Set([...candidateIds, ...chosen])]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const scores = scoresFor(catalog.products, profile, settings);
  const whyNow = catalog.dataDate ? await readWhyNow(region, catalog.dataDate, repo) : {};
  const savedIds = new Set(saved.map((s) => s.product_id));
  const favoriteIds = new Set(favorites);
  const view = (id: string): ProductView | null => {
    const product = byId.get(id);
    return product
      ? toProductView(product, profile.plan, savedIds.has(id), { scores: scores.get(id), whyNow: whyNow[id] ?? null, favorite: favoriteIds.has(id) })
      : null;
  };
  return {
    chosen: chosen.map(view).filter((v): v is ProductView => v !== null),
    candidates: candidateIds.map(view).filter((v): v is ProductView => v !== null),
    dataDate: catalog.dataDate,
  };
}
