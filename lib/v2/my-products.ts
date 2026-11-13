import { getLiveCatalog } from '@/lib/catalog';
import type { Repo } from '@/lib/db';
import type { Product, Profile, SavedProduct } from '@/lib/db/types';
import { isPaidPlan } from '@/lib/plans';
import { regionFor } from '@/lib/regions';
import { ensureBoard, getWeeklyGoal, listBoards, postingStats, type BoardRecord, type PostingStats } from './board';
import { findReplacements, isDeclining } from './decline';

export interface MyProductRow {
  saved: SavedProduct;
  product: Product;
  board: BoardRecord;
  declining: boolean;
  replacements: Product[];
}

/** Tout ce qu'affiche « Mes produits » : produits suivis, tableaux (créés à la demande), baisses, série, objectif. */
export async function loadMyProducts(repo: Repo, profile: Profile, today: string, now = new Date()): Promise<{ rows: MyProductRow[]; stats: PostingStats; paid: boolean }> {
  const saved = await repo.listSavedProducts(profile.id);
  const products = new Map((await repo.getProducts(saved.map((s) => s.product_id))).map((p) => [p.id, p]));
  const paid = isPaidPlan(profile.plan);
  const anyDeclining = saved.some((s) => products.get(s.product_id) && isDeclining(products.get(s.product_id)!));
  const catalog = paid && anyDeclining ? (await getLiveCatalog(repo, now, regionFor(profile))).products : [];
  const followed = new Set(saved.map((s) => s.product_id));
  const rows: MyProductRow[] = [];
  for (const s of saved) {
    const product = products.get(s.product_id);
    if (!product) continue;
    const board = await ensureBoard(repo, profile.id, s, product);
    const declining = isDeclining(product);
    rows.push({ saved: s, product, board, declining, replacements: declining && paid ? findReplacements(product, catalog, followed) : [] });
  }
  const boards = [...(await listBoards(repo, profile.id)).values()].map((b) => b.data);
  const { weekly } = await getWeeklyGoal(repo, profile.id);
  return { rows, stats: postingStats(boards, weekly, today), paid };
}
