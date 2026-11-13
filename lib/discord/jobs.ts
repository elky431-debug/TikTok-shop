import { getLiveCatalog } from '@/lib/catalog';
import { getRepo, type Repo } from '@/lib/db';
import { env } from '@/lib/env';
import { getPlan } from '@/lib/plans';
import { parisDate, parisHour } from '@/lib/utils';
import { discordStatus } from './config';
import { sendPublicationReminders } from '@/lib/v2/reminders';
import { syncDiscordRole } from './link';
import { channelMessages, digestMessage, type DiscordMessage } from './messages';
import { DiscordApiError, discordApi } from './rest';

/**
 * Tâche horaire Discord (fonction planifiée Netlify, toutes les heures) :
 * - récaps en message privé des abonnés dont l'heure est arrivée (une fois par jour : statut du récap) ;
 * - salons « produits du jour » à l'heure prévue (une fois par jour : tâche réservée) ;
 * - rôle Pro de chaque compte lié, une fois par jour (la liaison et chaque changement de plan le font déjà sur le coup).
 */
export interface DiscordRunResult {
  dms: { sent: number; failed: number };
  channels: 'publies' | 'deja' | 'pas-encore' | 'donnees-anciennes' | 'non-configure' | 'echec';
  roles: number | null;
  reminders: number;
}

async function send(channelId: string, message: DiscordMessage) {
  await discordApi('POST', `/channels/${channelId}/messages`, message);
}

/** Message privé : ouvre (ou retrouve) le salon privé avec POST /users/@me/channels, puis y écrit. */
async function sendDirect(discordUserId: string, message: DiscordMessage) {
  const channel = await discordApi<{ id: string }>('POST', '/users/@me/channels', { recipient_id: discordUserId });
  await send(channel.id, message);
}

export async function deliverDiscordDigests(repo: Repo, now: Date) {
  const day = parisDate(now);
  const hour = parisHour(now);
  const stats = { sent: 0, failed: 0 };
  for (const digest of await repo.listDigests(day)) {
    if (digest.discord_status !== 'pending') continue;
    const profile = await repo.getProfile(digest.user_id);
    if (!profile?.discord_user_id || !profile.digest_discord || !getPlan(profile.plan).discordDigest) {
      await repo.updateDigestStatus(digest.user_id, day, { discord_status: 'skipped' });
      continue;
    }
    if (hour < profile.digest_hour) continue;
    try {
      await sendDirect(profile.discord_user_id, digestMessage(digest.content, env.siteUrl));
      await repo.updateDigestStatus(digest.user_id, day, { discord_status: 'sent' });
      stats.sent++;
    } catch (error) {
      // 50007 : messages privés fermés, ou plus aucun serveur en commun avec le bot.
      if (!(error instanceof DiscordApiError && error.code === 50007)) console.warn('[discord] récap', profile.id, (error as Error).message);
      await repo.updateDigestStatus(digest.user_id, day, { discord_status: 'failed' });
      stats.failed++;
    }
  }
  return stats;
}

export async function postDiscordChannels(repo: Repo, now: Date): Promise<DiscordRunResult['channels']> {
  if (!discordStatus().channels) return 'non-configure';
  const day = parisDate(now);
  if (parisHour(now) < env.discordPublicPostHour) return 'pas-encore';
  if (!(await repo.claimDailyTask('discord-salons', day))) return 'deja';
  try {
    const catalog = await getLiveCatalog(repo, now);
    // Données de plus de 36 heures : pas de « produits du jour » (on ne réessaie pas avant demain).
    if (catalog.stale || catalog.products.length === 0) return 'donnees-anciennes';
    const { teaser, full } = channelMessages({ products: catalog.products, demo: catalog.demo, siteUrl: env.siteUrl });
    if (env.discordPublicChannelId) await send(env.discordPublicChannelId, teaser);
    if (env.discordProChannelId) await send(env.discordProChannelId, full);
    return 'publies';
  } catch (error) {
    console.error('[discord] salons', (error as Error).message);
    await repo.releaseDailyTask('discord-salons', day);
    return 'echec';
  }
}

export async function syncAllDiscordRoles(repo: Repo, now: Date): Promise<number | null> {
  if (!discordStatus().roles) return null;
  if (!(await repo.claimDailyTask('discord-roles', parisDate(now)))) return null;
  let synced = 0;
  for (const profile of await repo.listDiscordLinkedProfiles()) {
    if (await syncDiscordRole(profile)) synced++;
  }
  return synced;
}

export async function runDiscordHourly(opts: { repo?: Repo; now?: Date } = {}): Promise<DiscordRunResult> {
  const repo = opts.repo ?? getRepo();
  const now = opts.now ?? new Date();
  const status = discordStatus();
  return {
    dms: status.digests ? await deliverDiscordDigests(repo, now) : { sent: 0, failed: 0 },
    channels: await postDiscordChannels(repo, now),
    roles: await syncAllDiscordRoles(repo, now),
    reminders: await sendPublicationReminders(parisDate(now), repo, now),
  };
}
