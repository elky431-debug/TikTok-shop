import { getRepo, type Repo } from '@/lib/db';
import type { SavedProduct } from '@/lib/db/types';
import { addDays, parisDate, parisHour } from '@/lib/utils';
import type { PublicationPlan } from '@/lib/v2/planning';

/**
 * Historique des vidéos postées, jour par jour, pour la série et le récap du dimanche.
 *
 * Le nombre de vidéos postées vit dans « Mes produits » (bouton +1, ou plan de publication qui le met à jour) et n'a pas
 * de date. On relève donc ce compteur (fiche `suivi_videos`) et on attribue chaque hausse au jour où elle est vue :
 * - relevé de nuit (avant 6 h à Paris, tâche nocturne) : la veille, la journée qui vient de finir ;
 * - relevé de jour (page Récap, récap du dimanche) : le jour même.
 * Une baisse (correction « −1 ») retire du jour le plus récent qui en avait. Premier relevé : les vidéos marquées
 * « postées » dans les plans de publication sont rangées à leur date prévue, le reste n'a pas de date connue.
 */
export const VIDEO_HISTORY_KIND = 'suivi_videos';
/** Historique gardé : 120 jours, assez pour les séries et les comparaisons. */
const KEEP_DAYS = 120;

export interface VideoHistory {
  /** Compteur « vidéos postées » de chaque produit suivi au dernier relevé. */
  last: Record<string, number>;
  /** Dernier relevé (ISO). */
  observed_at: string | null;
  /** Vidéos postées par jour (AAAA-MM-JJ, heure de Paris) et par produit. */
  days: Record<string, Record<string, number>>;
}

/** Jour auquel rattacher une hausse observée à cet instant. */
export function attributionDay(at: Date): string {
  const day = parisDate(at);
  return parisHour(at) < 6 ? addDays(day, -1) : day;
}

function add(days: VideoHistory['days'], day: string, productId: string, n: number) {
  const row = (days[day] ??= {});
  row[productId] = (row[productId] ?? 0) + n;
}

/** Retire n vidéos du produit, en partant du jour le plus récent qui en a. */
function remove(days: VideoHistory['days'], productId: string, n: number) {
  for (const day of Object.keys(days).sort().reverse()) {
    if (n <= 0) return;
    const have = days[day][productId] ?? 0;
    const take = Math.min(have, n);
    if (take > 0) {
      days[day][productId] = have - take;
      if (!days[day][productId]) delete days[day][productId];
      if (!Object.keys(days[day]).length) delete days[day];
      n -= take;
    }
  }
}

/** Applique un relevé (pur) : renvoie le nouvel historique. */
export function applyObservation(
  previous: VideoHistory | null,
  saved: Array<Pick<SavedProduct, 'product_id' | 'videos_posted'>>,
  at: Date,
  plans: PublicationPlan[] = [],
): VideoHistory {
  const today = parisDate(at);
  const day = attributionDay(at);
  const history: VideoHistory = previous
    ? { last: { ...previous.last }, observed_at: previous.observed_at, days: JSON.parse(JSON.stringify(previous.days)) }
    : { last: {}, observed_at: null, days: {} };

  if (!previous) {
    // Premier relevé : les vidéos des plans marquées « postées », à leur date prévue (jamais dans le futur).
    for (const plan of plans) {
      for (const item of plan.items) {
        // Vidéo postée sans date prévue (tableau sans calendrier) : comptée aujourd'hui.
        if (item.status === 'poste') add(history.days, !item.date || item.date > today ? today : item.date, plan.product_id, 1);
      }
    }
    for (const row of saved) history.last[row.product_id] = row.videos_posted;
  } else {
    for (const row of saved) {
      const before = history.last[row.product_id] ?? 0;
      const delta = row.videos_posted - before;
      if (delta > 0) add(history.days, day, row.product_id, delta);
      else if (delta < 0) remove(history.days, row.product_id, -delta);
      history.last[row.product_id] = row.videos_posted;
    }
    // Produit retiré de « Mes produits » : on oublie son compteur, pas ses jours passés.
    for (const id of Object.keys(history.last)) if (!saved.some((s) => s.product_id === id)) delete history.last[id];
  }
  const oldest = addDays(today, -KEEP_DAYS);
  for (const d of Object.keys(history.days)) if (d < oldest) delete history.days[d];
  history.observed_at = at.toISOString();
  return history;
}

/** Relève le compteur d'un utilisateur et enregistre l'historique. */
export async function observePostedVideos(userId: string, repo: Repo = getRepo(), at = new Date()): Promise<VideoHistory> {
  const [records, saved, plans] = await Promise.all([
    repo.listRecords<VideoHistory>(userId, VIDEO_HISTORY_KIND),
    repo.listSavedProducts(userId),
    repo.listRecords<PublicationPlan>(userId, 'publication'),
  ]);
  const [record] = records;
  const next = applyObservation(record?.data ?? null, saved, at, plans.map((p) => p.data));
  await repo.saveRecord(userId, VIDEO_HISTORY_KIND, next, record?.id);
  return next;
}

/**
 * Tâche nocturne (à brancher après le rafraîchissement) : relève les vidéos postées de chaque compte qui suit au moins
 * un produit. Les hausses vues avant 6 h sont rangées la veille.
 */
export async function trackPostedVideos(date: string, repo: Repo = getRepo(), at = new Date()): Promise<{ users: number }> {
  void date;
  let users = 0;
  for (const profile of await repo.listOnboardedProfiles()) {
    const saved = await repo.listSavedProducts(profile.id);
    const [record] = await repo.listRecords<VideoHistory>(profile.id, VIDEO_HISTORY_KIND);
    if (!saved.length && !record) continue;
    await observePostedVideos(profile.id, repo, at);
    users++;
  }
  return { users };
}

/** Vidéos postées par jour, tous produits confondus. */
export function totalsByDay(history: VideoHistory): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [day, row] of Object.entries(history.days)) out[day] = Object.values(row).reduce((s, n) => s + n, 0);
  return out;
}

/**
 * Série : jours consécutifs avec au moins une vidéo postée, en remontant depuis aujourd'hui. Un jour sans vidéo
 * aujourd'hui ne casse pas encore la série (la journée n'est pas finie) : on part alors d'hier.
 */
export function currentStreak(byDay: Record<string, number>, today: string): number {
  let day = (byDay[today] ?? 0) > 0 ? today : addDays(today, -1);
  let streak = 0;
  while ((byDay[day] ?? 0) > 0) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

/** Meilleure série de l'historique gardé. */
export function bestStreak(byDay: Record<string, number>): number {
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of Object.keys(byDay).filter((d) => byDay[d] > 0).sort()) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}
