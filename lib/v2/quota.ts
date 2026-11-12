import { getRepo } from '@/lib/db';
import type { RecordKind } from '@/lib/db/types';
import { parisDate, parisTimeToUtc } from '@/lib/utils';

/**
 * Quota quotidien d'une fonction IA, appliqué côté serveur : nombre de fiches créées depuis minuit (heure de Paris).
 * Renvoie ce qu'il reste ; 0 = plus rien aujourd'hui.
 */
export async function remainingToday(userId: string, kind: RecordKind, limit: number, now = new Date()): Promise<number> {
  if (limit <= 0) return 0;
  const since = parisTimeToUtc(parisDate(now), 0).toISOString();
  const used = await getRepo().countRecordsSince(userId, kind, since);
  return Math.max(0, limit - used);
}
