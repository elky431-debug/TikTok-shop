import { getRepo } from '@/lib/db';
import type { RecordKind, UserRecord } from '@/lib/db/types';
import { remainingToday } from '@/lib/v2/quota';

/** Ce qu'il reste aujourd'hui (Infinity si illimité, 0 si fermé), d'après les fiches créées depuis minuit à Paris. */
export async function leftToday(userId: string, kind: RecordKind, limit: number): Promise<number> {
  if (limit <= 0) return 0;
  if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;
  return remainingToday(userId, kind, limit);
}

/**
 * Réserve une place dans le quota du jour en créant la fiche, puis recompte : si deux demandes simultanées ont
 * dépassé la limite, la fiche est retirée et la demande refusée (on peut refuser à tort, jamais accepter de trop).
 * Renvoie null si le quota est atteint.
 */
export async function reserveToday<T>(userId: string, kind: RecordKind, limit: number, data: T): Promise<UserRecord<T> | null> {
  if ((await leftToday(userId, kind, limit)) <= 0) return null;
  const repo = getRepo();
  const record = await repo.saveRecord<T>(userId, kind, data);
  // remainingToday(limite + 1) vaut 0 exactement quand on a dépassé la limite.
  if (Number.isFinite(limit) && (await remainingToday(userId, kind, limit + 1)) === 0) {
    await repo.deleteRecord(userId, record.id);
    return null;
  }
  return record;
}
