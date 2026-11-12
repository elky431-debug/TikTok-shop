import { getRepo } from '@/lib/db';
import type { Digest, Profile } from '@/lib/db/types';
import { ensureCatalog } from '@/lib/jobs/nightly';
import { parisDate } from '@/lib/utils';
import { buildDigestContent } from './build';
import { buildPersonal, type PersonalDigestContent } from './personal';
import { defaultDigestExtras } from './prepare';

export type PersonalDigest = Omit<Digest, 'content'> & { content: PersonalDigestContent };

/**
 * Récap du jour de l'utilisateur : celui préparé cette nuit, ou construit à la volée. La partie personnelle (alertes,
 * baisses, défi du jour) est recalculée à chaque affichage : la page montre l'état du moment (une vidéo marquée
 * « postée » à midi change le défi), l'e-mail garde celui de la nuit.
 */
export async function getTodayDigest(profile: Profile): Promise<PersonalDigest> {
  await ensureCatalog();
  const repo = getRepo();
  const day = parisDate();
  const stored = (await repo.getDigest(profile.id, day)) as PersonalDigest | null;
  // Reconstruit si le plan a changé depuis la préparation nocturne.
  if (stored && stored.content.plan === profile.plan) {
    return { ...stored, content: { ...stored.content, personal: await buildPersonal(profile, stored.content, day, repo) } };
  }
  const base = await buildDigestContent(profile, await repo.listProducts(), day, defaultDigestExtras(day));
  const content: PersonalDigestContent = { ...base, personal: await buildPersonal(profile, base, day, repo) };
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
