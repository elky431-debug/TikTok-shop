import { NextResponse } from 'next/server';
import { botUnauthorized } from '@/lib/bot-auth';
import { getRepo } from '@/lib/db';
import { env } from '@/lib/env';
import { getPlan } from '@/lib/plans';
import { parisDate, parisHour } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Récaps à envoyer en message privé maintenant (heure atteinte, Pro, Discord lié et activé). */
export async function GET(request: Request) {
  const denied = botUnauthorized(request);
  if (denied) return denied;
  const repo = getRepo();
  const day = parisDate();
  const hour = parisHour();
  const digests = await repo.listDigests(day);
  const due = [];
  for (const digest of digests) {
    if (digest.discord_status !== 'pending') continue;
    const profile = await repo.getProfile(digest.user_id);
    if (!profile?.discord_user_id || !profile.digest_discord || !getPlan(profile.plan).discordDigest) continue;
    if (hour < profile.digest_hour) continue;
    due.push({ user_id: profile.id, discord_user_id: profile.discord_user_id, day, content: digest.content });
  }
  return NextResponse.json({ day, site_url: env.siteUrl, due });
}
