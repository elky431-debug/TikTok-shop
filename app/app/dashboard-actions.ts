'use server';

import { revalidatePath } from 'next/cache';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { refreshCreatorProfile } from '@/lib/creator-profile';
import { getRepo } from '@/lib/db';
import { ensureBoard, saveBoard } from '@/lib/v2/board';
import { moveItem } from '@/lib/v2/planning';
import { parisDate } from '@/lib/utils';

/**
 * Actions du dashboard. Session revérifiée à chaque appel ; le relevé du profil TikTok garde sa règle d'un essai par
 * jour côté serveur, quel que soit le nombre de clics.
 */
export async function refreshCreatorAction(): Promise<{ ok: boolean; message: string | null }> {
  const { profile } = await requireOnboardedViewer('/app');
  const result = await refreshCreatorProfile(getRepo(), profile.id, profile.tiktok_handle);
  revalidatePath('/app');
  return { ok: Boolean(result?.fetched_at && !result.error), message: result?.error ?? null };
}

/** Coche (ou décoche) une vidéo « à tourner cette semaine » : elle passe en « Posté » (ou revient « À tourner »). */
export async function toggleUpcomingVideoAction(productId: string, n: number, done: boolean): Promise<{ ok: boolean; message?: string }> {
  const { profile } = await requireOnboardedViewer('/app');
  const repo = getRepo();
  const row = await repo.getSavedProduct(profile.id, String(productId));
  const product = row ? await repo.getProduct(row.product_id) : null;
  if (!row || !product) return { ok: false, message: 'Ce produit n’est plus dans tes produits suivis.' };
  const record = await ensureBoard(repo, profile.id, row, product);
  if (!Number.isInteger(n) || !record.data.items.some((i) => i.n === n)) return { ok: false, message: 'Cette vidéo n’existe plus. Recharge la page.' };
  await saveBoard(repo, profile.id, record, moveItem(record.data, n, done ? 'poste' : 'a_tourner', parisDate()));
  revalidatePath('/app');
  revalidatePath('/app/mes-produits');
  return { ok: true };
}
