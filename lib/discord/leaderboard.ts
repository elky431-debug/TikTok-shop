import type { Repo } from '@/lib/db';
import type { PlanItem, PublicationPlan } from '@/lib/v2/planning';
import { env } from '@/lib/env';
import { addDays, parisDate, parisHour } from '@/lib/utils';
import { COMMAND_KIND } from './account';
import { discordExtra, discordStatus } from './config';
import { leaderboardMessage } from './messages';
import { discordApi } from './rest';

/**
 * Classement communautaire des séries de jours, publié une fois par semaine (le lundi) dans le salon
 * DISCORD_LEADERBOARD_CHANNEL_ID. Uniquement les membres qui l'ont activé (réglage opt-in, fiche `reglages_discord`,
 * `/classement rejoindre`), dont le compte Discord est lié. Rien d'autre que la mention Discord et le nombre de jours.
 */
export const SETTINGS_KIND = 'reglages_discord';

export interface DiscordSettings {
  /** Apparaître dans le classement hebdomadaire des séries (false par défaut). */
  classement: boolean;
}

export async function getDiscordSettings(userId: string, repo: Repo): Promise<{ id: string | null; data: DiscordSettings }> {
  const [record] = await repo.listRecords<DiscordSettings>(userId, SETTINGS_KIND);
  return { id: record?.id ?? null, data: { classement: record?.data?.classement === true } };
}

/** Active ou retire la participation au classement (exportée aussi pour un réglage dans l'appli). */
export async function setLeaderboardOptIn(userId: string, optIn: boolean, repo: Repo): Promise<DiscordSettings> {
  const current = await getDiscordSettings(userId, repo);
  const data = { ...current.data, classement: optIn };
  await repo.saveRecord<DiscordSettings>(userId, SETTINGS_KIND, data, current.id ?? undefined);
  return data;
}

/** Nombre de jours d'affilée se terminant aujourd'hui (ou hier, si rien n'est encore fait aujourd'hui). */
export function streakDays(activeDays: Set<string>, today: string): number {
  let day = activeDays.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (activeDays.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

/**
 * Jours actifs d'un utilisateur (heure de Paris) : script écrit, commande /score ou /script, vidéo marquée postée
 * dans le plan de publication (à sa date prévue). Remplaçable par la vraie source des séries de l'appli
 * (`setStreakSource`) dès qu'elle existe.
 */
export async function defaultActiveDays(userId: string, repo: Repo): Promise<Set<string>> {
  const [scripts, commands, plans] = await Promise.all([
    repo.listScripts(userId, { limit: 400 }),
    repo.listRecords<unknown>(userId, COMMAND_KIND),
    repo.listRecords<PublicationPlan>(userId, 'publication'),
  ]);
  const days = new Set<string>();
  for (const s of scripts) days.add(parisDate(new Date(s.created_at)));
  for (const c of commands) days.add(parisDate(new Date(c.created_at)));
  for (const plan of plans) {
    for (const item of (plan.data?.items ?? []) as PlanItem[]) if (item.status === 'poste' && item.date) days.add(item.date);
  }
  return days;
}

type StreakSource = (userId: string, today: string, repo: Repo) => Promise<number>;
const defaultSource: StreakSource = async (userId, today, repo) => streakDays(await defaultActiveDays(userId, repo), today);
let source: StreakSource = defaultSource;

/** Branche la source officielle des séries (null revient à la source par défaut). */
export function setStreakSource(fn: StreakSource | null) {
  source = fn ?? defaultSource;
}

export async function currentStreak(userId: string, today: string, repo: Repo): Promise<number> {
  return source(userId, today, repo);
}

/** Les 10 meilleures séries parmi les membres inscrits et liés (au moins 1 jour). */
export async function leaderboardEntries(repo: Repo, now: Date): Promise<Array<{ userId: string; discordUserId: string; days: number }>> {
  const today = parisDate(now);
  const optedIn = new Set(
    (await repo.listAllRecords<DiscordSettings>(SETTINGS_KIND)).filter((r) => r.data?.classement === true).map((r) => r.user_id),
  );
  const entries: Array<{ userId: string; discordUserId: string; days: number }> = [];
  for (const profile of await repo.listDiscordLinkedProfiles()) {
    if (!profile.discord_user_id || !optedIn.has(profile.id)) continue;
    const days = await currentStreak(profile.id, today, repo);
    if (days >= 1) entries.push({ userId: profile.id, discordUserId: profile.discord_user_id, days });
  }
  return entries.sort((a, b) => b.days - a.days || a.discordUserId.localeCompare(b.discordUserId)).slice(0, 10);
}

export type LeaderboardOutcome = 'publie' | 'deja' | 'pas-encore' | 'vide' | 'non-configure' | 'echec';

/** Le lundi à DISCORD_LEADERBOARD_HOUR (heure de Paris), une seule fois par semaine (tâche réservée au lundi). */
export async function postWeeklyLeaderboard(repo: Repo, now: Date): Promise<LeaderboardOutcome> {
  if (!discordStatus().leaderboard) return 'non-configure';
  const today = parisDate(now);
  const monday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
  if (!monday || parisHour(now) < discordExtra.leaderboardHour) return 'pas-encore';
  if (!(await repo.claimDailyTask('discord-classement', today))) return 'deja';
  try {
    const entries = await leaderboardEntries(repo, now);
    // Personne d'inscrit avec une série : pas de message vide.
    if (!entries.length) return 'vide';
    await discordApi('POST', `/channels/${discordExtra.leaderboardChannelId}/messages`, leaderboardMessage(entries, env.siteUrl));
    return 'publie';
  } catch (error) {
    console.error('[discord] classement', (error as Error).message);
    await repo.releaseDailyTask('discord-classement', today);
    return 'echec';
  }
}
