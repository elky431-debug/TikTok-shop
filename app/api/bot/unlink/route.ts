import { NextResponse } from 'next/server';
import { botUnauthorized } from '@/lib/bot-auth';
import { getRepo } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = botUnauthorized(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { discord_user_id?: string };
  const repo = getRepo();
  const profile = await repo.getProfileByDiscordId(String(body.discord_user_id ?? ''));
  if (!profile) return NextResponse.json({ ok: false, error: 'Aucun compte lié à ce Discord.' }, { status: 404 });
  await repo.updateProfile(profile.id, { discord_user_id: null, digest_discord: false });
  return NextResponse.json({ ok: true });
}
