import { getRepo } from '@/lib/db';
import type { Digest, Profile } from '@/lib/db/types';
import { ensureCatalog } from '@/lib/jobs/nightly';
import { parisDate } from '@/lib/utils';
import { buildDigestContent } from './build';
import { defaultDigestExtras } from './prepare';

/** Récap du jour de l'utilisateur : celui préparé cette nuit, ou construit à la volée. */
export async function getTodayDigest(profile: Profile): Promise<Digest> {
  await ensureCatalog();
  const repo = getRepo();
  const day = parisDate();
  const stored = await repo.getDigest(profile.id, day);
  // Reconstruit si le plan a changé depuis la préparation nocturne.
  if (stored && stored.content.plan === profile.plan) return stored;
  const content = await buildDigestContent(profile, await repo.listProducts(), day, defaultDigestExtras(day));
  const digest = {
    user_id: profile.id,
    day,
    content,
    email_status: stored?.email_status ?? ('pending' as const),
    discord_status: stored?.discord_status ?? ('pending' as const),
  };
  await repo.upsertDigest(digest);
  return { ...digest, created_at: new Date().toISOString() };
}
