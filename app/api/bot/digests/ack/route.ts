import { NextResponse } from 'next/server';
import { botUnauthorized } from '@/lib/bot-auth';
import { getRepo } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = botUnauthorized(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { user_id?: string; day?: string; status?: string };
  const status = body.status === 'sent' ? 'sent' : 'failed';
  if (!body.user_id || !body.day) return NextResponse.json({ ok: false }, { status: 400 });
  await getRepo().updateDigestStatus(body.user_id, body.day, { discord_status: status });
  return NextResponse.json({ ok: true });
}
