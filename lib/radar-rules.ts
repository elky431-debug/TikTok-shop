import type { Product } from '@/lib/db/types';
import type { NicheId } from '@/lib/niches';
import { getPlan } from '@/lib/plans';
import type { PlanId } from '@/lib/db/types';

/** Produits des niches de l'utilisateur (toutes si aucune), triés par score décroissant. */
export function rankForUser(products: Product[], niches: NicheId[]): Product[] {
  const pool = niches.length ? products.filter((p) => niches.includes(p.niche)) : products;
  return [...pool].sort((a, b) => b.latest_score - a.latest_score || a.id.localeCompare(b.id));
}

/**
 * Identifiants visibles en clair aujourd'hui pour ce plan.
 * Gratuit : les 3 meilleurs de ses niches, fixés pour la journée (les filtres ne changent rien).
 */
export function visibleProductIds(ranked: Product[], plan: PlanId): Set<string> {
  const limit = getPlan(plan).visibleProducts;
  if (!Number.isFinite(limit)) return new Set(ranked.map((p) => p.id));
  return new Set(ranked.slice(0, limit).map((p) => p.id));
}
