import { createElement } from 'react';
import { PublicationReminderEmail } from '@/emails/publication-reminder';
import type { Repo } from '@/lib/db';
import type { UserRecord } from '@/lib/db/types';
import { discordStatus } from '@/lib/discord/config';
import { linkButton } from '@/lib/discord/messages';
import { discordApi } from '@/lib/discord/rest';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { getPlan } from '@/lib/plans';
import { parisHour, parisTimeToUtc } from '@/lib/utils';
import { dueOn, type PublicationPlan } from './planning';

type Due = Array<{ product: string; n: number; total: number }>;

/** Vidéos du jour par utilisateur (plans des comptes Pro et Pro+ seulement). */
async function dueByUser(repo: Repo, day: string): Promise<Map<string, Due>> {
  const plans = await repo.listAllRecords<PublicationPlan>('publication');
  const byUser = new Map<string, Due>();
  for (const record of plans as Array<UserRecord<PublicationPlan>>) {
    for (const item of dueOn(record.data, day)) {
      const list = byUser.get(record.user_id) ?? [];
      list.push({ product: record.data.product_name, n: item.n, total: record.data.items.length });
      byUser.set(record.user_id, list);
    }
  }
  return byUser;
}

/** Tâche nocturne : un e-mail par personne, programmé à son heure de récap, une seule fois par jour. */
export async function schedulePublicationEmails(day: string, repo: Repo, now = new Date()): Promise<number> {
  let sent = 0;
  for (const [userId, items] of await dueByUser(repo, day)) {
    const profile = await repo.getProfile(userId);
    if (!profile || !getPlan(profile.plan).planning || !profile.digest_email) continue;
    if (!(await repo.claimDailyTask(`rappel-publication-email:${userId}`, day))) continue;
    const due = parisTimeToUtc(day, profile.digest_hour);
    try {
      await sendEmail({
        to: profile.email,
        subject: items.length > 1 ? `Aujourd’hui : ${items.length} vidéos à poster` : `Aujourd’hui : ta vidéo n°${items[0].n} sur ${items[0].product}`,
        react: createElement(PublicationReminderEmail, { items, siteUrl: env.siteUrl }),
        scheduledAt: due.getTime() > now.getTime() + 60_000 ? due.toISOString() : undefined,
        idempotencyKey: `rappel-publication-${userId}-${day}`,
      });
      sent++;
    } catch (error) {
      await repo.releaseDailyTask(`rappel-publication-email:${userId}`, day);
      console.error('[rappel publication] e-mail', userId, error instanceof Error ? error.message : error);
    }
  }
  return sent;
}

/** Tâche horaire Discord : message privé à l'heure de récap de chacun, une seule fois par jour. */
export async function sendPublicationDiscordReminders(day: string, repo: Repo, now = new Date()): Promise<number> {
  if (!discordStatus().digests) return 0;
  let sent = 0;
  for (const [userId, items] of await dueByUser(repo, day)) {
    const profile = await repo.getProfile(userId);
    if (!profile?.discord_user_id || !profile.digest_discord || !getPlan(profile.plan).planning) continue;
    if (parisHour(now) < profile.digest_hour) continue;
    if (!(await repo.claimDailyTask(`rappel-publication-discord:${userId}`, day))) continue;
    try {
      const channel = await discordApi<{ id: string }>('POST', '/users/@me/channels', { recipient_id: profile.discord_user_id });
      await discordApi('POST', `/channels/${channel.id}/messages`, {
        content: `🎬 Aujourd’hui :\n${items.map((i) => `• vidéo n°${i.n}/${i.total} sur ${i.product}`).join('\n')}`,
        components: [linkButton('Ouvrir mon plan', `${env.siteUrl}/app/plan`)],
      });
      sent++;
    } catch (error) {
      console.warn('[rappel publication] Discord', userId, error instanceof Error ? error.message : error);
    }
  }
  return sent;
}
