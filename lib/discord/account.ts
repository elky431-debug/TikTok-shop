import type { Repo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { getPlan } from '@/lib/plans';
import { parisDate, parisTimeToUtc } from '@/lib/utils';

/**
 * Compte Discord → profil → plan. Les quotas sont ceux de l'appli (lib/plans.ts), appliqués ici, côté serveur.
 * /score et /script comptent dans `discordCommandsPerDay` (3, 30, 100) : une fiche `commande_discord` par commande,
 * comptée depuis minuit (heure de Paris), comme les autres quotas quotidiens.
 */
export const COMMAND_KIND = 'commande_discord';

export interface DiscordCommandData {
  command: 'score' | 'script';
  product_id: string | null;
  /** true = la commande appelle l'IA (coût estimé dans l'écran admin). */
  ia: boolean;
  status: 'en_cours' | 'ok' | 'echec';
}

export const NOT_LINKED =
  'Lie d’abord ton compte : dans l’appli, page Récap, génère un code, puis tape /lier suivi du code ici. Les commandes suivent ton plan.';

export async function linkedProfile(discordUserId: string, repo: Repo): Promise<Profile | null> {
  if (!/^\d{5,25}$/.test(discordUserId)) return null;
  return repo.getProfileByDiscordId(discordUserId);
}

/** Commandes /score et /script restantes aujourd'hui. */
export async function remainingCommands(profile: Profile, repo: Repo, now = new Date()): Promise<{ remaining: number; limit: number }> {
  const limit = getPlan(profile.plan).discordCommandsPerDay;
  if (!Number.isFinite(limit)) return { remaining: Number.POSITIVE_INFINITY, limit };
  const since = parisTimeToUtc(parisDate(now), 0).toISOString();
  const used = await repo.countRecordsSince(profile.id, COMMAND_KIND, since);
  return { remaining: Math.max(0, limit - used), limit };
}

function quotaMessage(profile: Profile, limit: number): string {
  const next = profile.plan === 'free' ? ' Avec Pro : 30 par jour.' : profile.plan === 'pro' ? ' Avec Pro+ : 100 par jour.' : '';
  return `Tu as utilisé tes ${limit} commandes /score et /script du jour (plan ${getPlan(profile.plan).name}).${next} Le compteur repart à minuit.`;
}

/** Réserve une commande (avant de répondre) ; à rendre avec `releaseCommand` si elle échoue. */
export async function reserveCommand(
  profile: Profile,
  data: Omit<DiscordCommandData, 'status'>,
  repo: Repo,
  now = new Date(),
): Promise<{ ok: true; recordId: string; remaining: number } | { ok: false; message: string }> {
  const { remaining, limit } = await remainingCommands(profile, repo, now);
  if (remaining <= 0) return { ok: false, message: quotaMessage(profile, limit) };
  const record = await repo.saveRecord<DiscordCommandData>(profile.id, COMMAND_KIND, { ...data, status: data.ia ? 'en_cours' : 'ok' });
  return { ok: true, recordId: record.id, remaining: remaining - 1 };
}

export async function finishCommand(userId: string, recordId: string, data: DiscordCommandData, repo: Repo) {
  await repo.saveRecord<DiscordCommandData>(userId, COMMAND_KIND, data, recordId);
}

/** Rend la commande (échec avant ou pendant le travail) : elle ne compte pas dans le quota. */
export async function releaseCommand(userId: string, recordId: string, repo: Repo) {
  await repo.deleteRecord(userId, recordId);
}
