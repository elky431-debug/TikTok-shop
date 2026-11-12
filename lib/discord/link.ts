import { getRepo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { env } from '@/lib/env';
import { getPlan } from '@/lib/plans';
import { discordStatus } from './config';
import { DiscordApiError, discordApi } from './rest';

export type LinkResult =
  | { ok: true; firstName: string | null; planName: string; pro: boolean }
  | { ok: false; error: string };

/** /lier CODE : associe un compte Discord à un compte de l'appli (code à usage unique, 15 minutes). */
export async function linkDiscordAccount(rawCode: string, discordUserId: string): Promise<LinkResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code || !/^\d{5,25}$/.test(discordUserId)) return { ok: false, error: 'Code ou identifiant Discord manquant.' };
  const repo = getRepo();
  const already = await repo.getProfileByDiscordId(discordUserId);
  const userId = await repo.consumeDiscordLinkCode(code);
  if (!userId) return { ok: false, error: 'Ce code est invalide ou a expiré. Génère-en un nouveau dans l’appli (page Récap).' };
  if (already && already.id !== userId) await repo.updateProfile(already.id, { discord_user_id: null, digest_discord: false });
  const current = await repo.getProfile(userId);
  const profile = await repo.updateProfile(userId, {
    discord_user_id: discordUserId,
    digest_discord: getPlan(current?.plan).discordDigest,
  });
  await syncDiscordRole(profile, { quick: true });
  const plan = getPlan(profile.plan);
  return { ok: true, firstName: profile.first_name, planName: plan.name, pro: plan.discordDigest };
}

/** /delier, ou « Délier Discord » dans l'appli : retire la liaison et le rôle Pro. */
export async function unlinkDiscordAccount(discordUserId: string): Promise<boolean> {
  const repo = getRepo();
  const profile = await repo.getProfileByDiscordId(discordUserId);
  if (!profile) return false;
  await repo.updateProfile(profile.id, { discord_user_id: null, digest_discord: false });
  await setProRole(discordUserId, false, { quick: true });
  return true;
}

/**
 * Rôle Pro sur le serveur (PUT ou DELETE /guilds/{guild.id}/members/{user.id}/roles/{role.id}, permission
 * MANAGE_ROLES). Ne lève jamais : un membre absent du serveur (code 10007) ou une panne de Discord ne doit bloquer ni
 * la liaison ni un paiement. `quick` : délai court, pour répondre à Discord dans les 3 secondes.
 */
export async function setProRole(discordUserId: string, pro: boolean, opts: { quick?: boolean } = {}): Promise<boolean> {
  if (!discordStatus().roles) return false;
  try {
    await discordApi(
      pro ? 'PUT' : 'DELETE',
      `/guilds/${env.discordGuildId}/members/${discordUserId}/roles/${env.discordProRoleId}`,
      undefined,
      { timeoutMs: opts.quick ? 1500 : 10_000 },
    );
    return true;
  } catch (error) {
    if (!(error instanceof DiscordApiError && error.code === 10007)) console.warn('[discord] rôle', (error as Error).message);
    return false;
  }
}

export async function syncDiscordRole(profile: Pick<Profile, 'discord_user_id' | 'plan'>, opts: { quick?: boolean } = {}) {
  if (!profile.discord_user_id) return false;
  return setProRole(profile.discord_user_id, getPlan(profile.plan).discordDigest, opts);
}
