import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

/** Les routes /api/bot/* ne répondent qu'au bot (en-tête Authorization: Bearer BOT_API_SECRET). */
export function botUnauthorized(request: Request): NextResponse | null {
  const secret = env.botApiSecret;
  if (!secret) return NextResponse.json({ error: 'BOT_API_SECRET n’est pas configuré sur l’appli.' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }
  return null;
}
