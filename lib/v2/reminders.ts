import { createElement } from 'react';
import { PublicationReminderEmail } from '@/emails/publication-reminder';
import type { Repo } from '@/lib/db';
import type { UserRecord } from '@/lib/db/types';
import { isDiscordConfigured } from '@/lib/discord/config';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { notify } from '@/lib/notify';
import { getPlan } from '@/lib/plans';
import { parisHour, parisTimeToUtc } from '@/lib/utils';
import { dueOn, type PublicationPlan } from './planning';

/**
 * Rappels du plan de publication, le jour J, à l'heure du récap de chacun.
 *
 * - Toutes les heures (`sendPublicationReminders`) : une notification par personne et par jour via `notify` (centre de
 *   notifications, push, e-mail si le récap e-mail est activé, message privé Discord si le compte est lié).
 * - La nuit (`schedulePublicationEmails`), seulement quand aucune tâche horaire ne tourne (Discord non configuré, la
 *   tâche horaire n'est alors pas appelée) : e-mail programmé chez Resend à l'heure du récap (notify n'envoie que tout
 *   de suite) et entrée dans le centre de notifications.
 * Rien n'est publié à la place de l'utilisateur.
 */
type Due = Array<{ product: string; n: number; total: number }>;

/** Vidéos du jour par utilisateur. */
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

const subjectFor = (items: Due) =>
  items.length > 1 ? `Aujourd’hui : ${items.length} vidéos à poster` : `Aujourd’hui : ta vidéo n°${items[0].n} sur ${items[0].product}`;

const bodyFor = (items: Due) =>
  [...items.map((i) => `• Vidéo n°${i.n}/${i.total} : ${i.product}`), 'Rien n’est publié à ta place : tourne, poste, puis coche la vidéo dans ton tableau.'].join('\n');

/**
 * Tâche horaire : rappel par `notify` quand l'heure du récap de la personne est arrivée, une seule fois par jour
 * (clé d'idempotence). Plans avec calendrier seulement (Pro et Pro+).
 */
export async function sendPublicationReminders(day: string, repo: Repo, now = new Date()): Promise<number> {
  let sent = 0;
  for (const [userId, items] of await dueByUser(repo, day)) {
    const profile = await repo.getProfile(userId);
    if (!profile || !getPlan(profile.plan).planning) continue;
    if (parisHour(now) < profile.digest_hour) continue;
    const done = await notify(
      userId,
      {
        type: 'rappel',
        title: subjectFor(items),
        body: bodyFor(items),
        path: '/app/plan',
        action: 'Ouvrir mon plan',
        // Le récap du matin par e-mail contient déjà le défi du jour : pas de second e-mail à la même heure.
        channels: { push: true, email: !profile.digest_email, discord: profile.digest_discord && Boolean(profile.discord_user_id) },
        dedupeKey: `rappel-publication:${day}`,
      },
      repo,
    );
    if (done) sent++;
  }
  return sent;
}

/** Appelée par la tâche horaire Discord (lib/discord/jobs.ts) : même rappel, tous canaux, via notify. */
export async function sendPublicationDiscordReminders(day: string, repo: Repo, now = new Date()): Promise<number> {
  return sendPublicationReminders(day, repo, now);
}

/**
 * Tâche nocturne : sans tâche horaire (Discord non configuré), e-mail programmé à l'heure du récap, une seule fois
 * par jour, et entrée dans le centre de notifications. Avec la tâche horaire, rien ici (elle s'en charge).
 */
export async function schedulePublicationEmails(day: string, repo: Repo, now = new Date()): Promise<number> {
  if (isDiscordConfigured()) return 0;
  let sent = 0;
  for (const [userId, items] of await dueByUser(repo, day)) {
    const profile = await repo.getProfile(userId);
    if (!profile || !getPlan(profile.plan).planning) continue;
    if (profile.digest_email && (await repo.claimDailyTask(`rappel-publication-email:${userId}`, day))) {
      const due = parisTimeToUtc(day, profile.digest_hour);
      try {
        await sendEmail({
          to: profile.email,
          subject: subjectFor(items),
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
    await notify(
      userId,
      {
        type: 'rappel',
        title: subjectFor(items),
        body: bodyFor(items),
        path: '/app/plan',
        channels: { push: false, email: false, discord: false },
        dedupeKey: `rappel-publication:${day}`,
      },
      repo,
    );
  }
  return sent;
}
