import type { Repo } from '@/lib/db';
import type { Product, SavedProduct, UserRecord } from '@/lib/db/types';
import {
  clampWeeklyGoal,
  DEFAULT_WEEKLY_GOAL,
  newBoard,
  planProgress,
  postedDates,
  postedThisWeek,
  postingStreak,
  resizeBoard,
  type PublicationPlan,
  type VideoGoalSettings,
} from './planning';

/**
 * Accès serveur au tableau des vidéos (fiche `publication`, une par produit suivi) : création à la demande, compteur
 * de « Mes produits » tenu à jour, série et objectif hebdomadaire (fiche `objectif_videos`).
 */
export const BOARD_KIND = 'publication';
export const VIDEO_GOAL_KIND = 'objectif_videos';

export type BoardRecord = UserRecord<PublicationPlan>;

/** Tableaux de l'utilisateur, un par produit (le plus récent s'il en existait deux). */
export async function listBoards(repo: Repo, userId: string): Promise<Map<string, BoardRecord>> {
  const byProduct = new Map<string, BoardRecord>();
  for (const record of await repo.listRecords<PublicationPlan>(userId, BOARD_KIND)) {
    if (!byProduct.has(record.data.product_id)) byProduct.set(record.data.product_id, record);
  }
  return byProduct;
}

/** Tableau d'un produit suivi : créé à la première ouverture, avec le compteur d'avant (vidéos déjà postées). */
export async function ensureBoard(repo: Repo, userId: string, saved: SavedProduct, product: Pick<Product, 'id' | 'name'>): Promise<BoardRecord> {
  const existing = (await listBoards(repo, userId)).get(product.id);
  if (existing) return existing;
  const board = newBoard({ productId: product.id, productName: product.name, goal: saved.video_goal, alreadyPosted: saved.videos_posted });
  return repo.saveRecord(userId, BOARD_KIND, board);
}

/** Enregistre le tableau et recopie le nombre de vidéos postées et l'objectif dans « Mes produits ». */
export async function saveBoard(repo: Repo, userId: string, record: BoardRecord, plan: PublicationPlan): Promise<BoardRecord> {
  const saved = await repo.saveRecord(userId, BOARD_KIND, plan, record.id);
  const row = await repo.getSavedProduct(userId, plan.product_id);
  if (row) {
    const progress = planProgress(plan);
    if (row.videos_posted !== progress.posted || row.video_goal !== progress.total) {
      await repo.updateSavedProduct(userId, plan.product_id, { videos_posted: progress.posted, video_goal: progress.total });
    }
  }
  return saved;
}

/** Nouvel objectif de vidéos pour un produit : le tableau suit. */
export async function setBoardGoal(repo: Repo, userId: string, saved: SavedProduct, product: Pick<Product, 'id' | 'name'>, goal: number, today: string) {
  const record = await ensureBoard(repo, userId, saved, product);
  return saveBoard(repo, userId, record, resizeBoard(record.data, goal, today));
}

export async function getWeeklyGoal(repo: Repo, userId: string): Promise<{ id: string | null; weekly: number }> {
  const [record] = await repo.listRecords<VideoGoalSettings>(userId, VIDEO_GOAL_KIND);
  return { id: record?.id ?? null, weekly: record ? clampWeeklyGoal(record.data.weekly) : DEFAULT_WEEKLY_GOAL };
}

export async function setWeeklyGoal(repo: Repo, userId: string, weekly: number) {
  const current = await getWeeklyGoal(repo, userId);
  await repo.saveRecord<VideoGoalSettings>(userId, VIDEO_GOAL_KIND, { weekly: clampWeeklyGoal(weekly) }, current.id ?? undefined);
}

export interface PostingStats {
  streak: number;
  thisWeek: number;
  weeklyGoal: number;
  totalPosted: number;
  postedToday: boolean;
}

export function postingStats(plans: PublicationPlan[], weeklyGoal: number, today: string): PostingStats {
  const dates = postedDates(plans);
  return {
    streak: postingStreak(dates, today),
    thisWeek: postedThisWeek(dates, today),
    weeklyGoal,
    totalPosted: plans.reduce((s, p) => s + planProgress(p).posted, 0),
    postedToday: dates.includes(today),
  };
}
