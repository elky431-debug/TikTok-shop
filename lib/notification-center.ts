import { getRepo, type Repo } from '@/lib/db';
import type { UserRecord } from '@/lib/db/types';
import type { NotificationData, NotificationType } from '@/lib/notify';

/**
 * Centre de notifications (/app/notifications) : lecture des fiches `notification` créées par `notify()` (lib/notify.ts).
 * Les fonctions de base (liste, tout marquer comme lu) restent dans lib/notify.ts ; ici, ce qu'il faut en plus pour la
 * page, le menu (nombre de non lues) et le ménage nocturne.
 */
export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  alerte: 'Alerte',
  baisse: 'Baisse',
  rappel: 'Rappel',
  recap: 'Récap',
  annonce: 'Nouveauté',
  systeme: 'Compte',
};

/** Nombre de notifications non lues (pastille du menu). */
export async function countUnreadNotifications(userId: string, repo: Repo = getRepo()): Promise<number> {
  return (await repo.listRecords<NotificationData>(userId, 'notification')).filter((r) => !r.data.read).length;
}

/** Marque une notification comme lue et renvoie son chemin (null si elle n'existe pas ou n'est pas à l'utilisateur). */
export async function openNotification(userId: string, id: string, repo: Repo = getRepo()): Promise<string | null> {
  const record = await repo.getRecord<NotificationData>(userId, id);
  if (!record || record.kind !== 'notification') return null;
  if (!record.data.read) await repo.saveRecord(userId, 'notification', { ...record.data, read: true }, record.id);
  return safePath(record.data.path);
}

/** Chemin interne seulement (jamais d'adresse externe ou de « //autre-site »). */
export function safePath(path: string | null | undefined): string {
  return path && path.startsWith('/') && !path.startsWith('//') ? path : '/app/notifications';
}

/** Groupes de la page : aujourd'hui, cette semaine, plus ancien. */
export function groupNotifications(records: Array<UserRecord<NotificationData>>, now = new Date()) {
  const day = 86_400_000;
  const groups: Array<{ label: string; items: Array<UserRecord<NotificationData>> }> = [
    { label: 'Aujourd’hui', items: [] },
    { label: 'Cette semaine', items: [] },
    { label: 'Plus ancien', items: [] },
  ];
  for (const record of [...records].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const age = now.getTime() - new Date(record.created_at).getTime();
    groups[age < day ? 0 : age < 7 * day ? 1 : 2].items.push(record);
  }
  return groups.filter((g) => g.items.length);
}

/** Ménage nocturne : notifications lues de plus de 60 jours, et au-delà des 300 plus récentes. */
export async function pruneNotifications(repo: Repo = getRepo(), now = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const byUser = new Map<string, Array<UserRecord<NotificationData>>>();
  for (const record of await repo.listAllRecords<NotificationData>('notification')) {
    const list = byUser.get(record.user_id) ?? [];
    list.push(record);
    byUser.set(record.user_id, list);
  }
  let removed = 0;
  for (const [userId, list] of byUser) {
    const sorted = list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const [i, record] of sorted.entries()) {
      if (i >= 300 || (record.data.read && record.created_at < limit)) {
        await repo.deleteRecord(userId, record.id);
        removed++;
      }
    }
  }
  return removed;
}
