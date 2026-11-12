import { getRepo } from '@/lib/db';
import { randomCode } from '@/lib/utils';

export const DISCORD_CODE_TTL_MINUTES = 15;

/** Code à usage unique à taper dans Discord : /lier CODE. */
export async function createDiscordLinkCode(userId: string): Promise<{ code: string; expiresAt: string }> {
  const code = randomCode(6);
  const expiresAt = new Date(Date.now() + DISCORD_CODE_TTL_MINUTES * 60_000).toISOString();
  await getRepo().createDiscordLinkCode(userId, code, expiresAt);
  return { code, expiresAt };
}
