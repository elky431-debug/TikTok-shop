import { NextResponse } from 'next/server';
import { botUnauthorized } from '@/lib/bot-auth';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/** Comptes Discord liés et leur droit au rôle Pro (synchronisation des rôles). */
export async function GET(request: Request) {
  const denied = botUnauthorized(request);
  if (denied) return denied;
  const profiles = await getRepo().listDiscordLinkedProfiles();
  const members = profiles.map((p) => ({ discord_user_id: p.discord_user_id, plan: p.plan, pro: getPlan(p.plan).discordDigest }));
  return NextResponse.json({ members });
}
