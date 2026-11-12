import { NextResponse } from 'next/server';
import { botUnauthorized } from '@/lib/bot-auth';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/** /lier CODE : associe un compte Discord à un compte de l'appli. */
export async function POST(request: Request) {
  const denied = botUnauthorized(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { code?: string; discord_user_id?: string };
  const code = String(body.code ?? '').trim().toUpperCase();
  const discordId = String(body.discord_user_id ?? '').trim();
  if (!code || !/^\d{5,25}$/.test(discordId)) {
    return NextResponse.json({ ok: false, error: 'Code ou identifiant Discord manquant.' }, { status: 400 });
  }
  const repo = getRepo();
  const already = await repo.getProfileByDiscordId(discordId);
  const userId = await repo.consumeDiscordLinkCode(code);
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Ce code est invalide ou a expiré. Génère-en un nouveau dans l’appli.' }, { status: 404 });
  }
  if (already && already.id !== userId) await repo.updateProfile(already.id, { discord_user_id: null, digest_discord: false });
  const profile = await repo.updateProfile(userId, {
    discord_user_id: discordId,
    digest_discord: getPlan((await repo.getProfile(userId))?.plan).discordDigest,
  });
  const plan = getPlan(profile.plan);
  return NextResponse.json({ ok: true, first_name: profile.first_name, plan: plan.id, plan_name: plan.name, pro: plan.discordDigest });
}
