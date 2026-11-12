import { createElement } from 'react';
import { NotificationEmail } from '@/emails/notification';
import { getRepo, type Repo } from '@/lib/db';
import { discordStatus } from '@/lib/discord/config';
import { linkButton } from '@/lib/discord/messages';
import { discordApi } from '@/lib/discord/rest';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { sendPush } from '@/lib/push';

/**
 * Notifications : un seul point d'entrée pour toute l'appli (alertes, baisses, rappels, récaps…). Chaque notification
 * est gardée dans le centre de notifications (fiche `notification`), puis envoyée sur les canaux demandés : push web
 * (si l'utilisateur l'a accepté), e-mail, message privé Discord (si lié). Un canal en panne n'empêche pas les autres.
 */
export type NotificationType = 'alerte' | 'baisse' | 'rappel' | 'recap' | 'annonce' | 'systeme';

export interface NotificationData {
  type: NotificationType;
  title: string;
  body: string;
  /** Chemin dans l'appli (« /app/produit/… »). */
  path: string;
  read: boolean;
  channels: { push: boolean; email: boolean; discord: boolean };
}

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  path: string;
  /** Libellé du bouton de l'e-mail. */
  action?: string;
  channels?: Partial<{ push: boolean; email: boolean; discord: boolean }>;
  /** Clé d'idempotence (une seule notification pour cette clé et ce jour). */
  dedupeKey?: string;
}

export async function notify(userId: string, input: NotifyInput, repo: Repo = getRepo()): Promise<NotificationData | null> {
  if (input.dedupeKey && !(await repo.claimDailyTask(`notif:${input.dedupeKey}:${userId}`, new Date().toISOString().slice(0, 10)))) {
    return null;
  }
  const profile = await repo.getProfile(userId);
  if (!profile) return null;
  const url = `${env.siteUrl}${input.path}`;
  const wanted = { push: true, email: false, discord: false, ...input.channels };
  const sent = { push: false, email: false, discord: false };

  if (wanted.push) sent.push = await sendPush(userId, { title: input.title, body: input.body, url });
  if (wanted.email && profile.email) {
    try {
      await sendEmail({
        to: profile.email,
        subject: input.title,
        react: createElement(NotificationEmail, { title: input.title, body: input.body, url, action: input.action ?? 'Ouvrir' }),
        idempotencyKey: input.dedupeKey ? `notif-${input.dedupeKey}-${userId}` : undefined,
      });
      sent.email = true;
    } catch (error) {
      console.warn('[notification] e-mail', userId, error instanceof Error ? error.message : error);
    }
  }
  if (wanted.discord && profile.discord_user_id && discordStatus().digests) {
    try {
      const channel = await discordApi<{ id: string }>('POST', '/users/@me/channels', { recipient_id: profile.discord_user_id });
      await discordApi('POST', `/channels/${channel.id}/messages`, {
        content: `**${input.title}**\n${input.body}`.slice(0, 1900),
        components: [linkButton(input.action ?? 'Ouvrir', url)],
      });
      sent.discord = true;
    } catch (error) {
      console.warn('[notification] Discord', userId, error instanceof Error ? error.message : error);
    }
  }
  const data: NotificationData = { type: input.type, title: input.title, body: input.body, path: input.path, read: false, channels: sent };
  await repo.saveRecord(userId, 'notification', data);
  return data;
}

export async function listNotifications(userId: string, repo: Repo = getRepo()) {
  return repo.listRecords<NotificationData>(userId, 'notification');
}

export async function markNotificationsRead(userId: string, repo: Repo = getRepo()) {
  for (const record of await repo.listRecords<NotificationData>(userId, 'notification')) {
    if (!record.data.read) await repo.saveRecord(userId, 'notification', { ...record.data, read: true }, record.id);
  }
}
