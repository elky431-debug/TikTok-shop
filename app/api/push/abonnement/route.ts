import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { isPushConfigured } from '@/lib/webpush/config';
import { parseSubscription, removePushSubscription, savePushSubscription } from '@/lib/webpush/subscriptions';

export const dynamic = 'force-dynamic';

/**
 * Abonnement push de l'appareil, envoyé par le bouton « Activer les notifications » après l'accord du navigateur.
 * POST { subscription: PushSubscription.toJSON() } : enregistre ; DELETE { endpoint } : retire.
 * Réservé au compte connecté, depuis le site lui-même (en-tête Origin vérifié : pas d'appel depuis un autre site).
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set([new URL(request.url).origin]);
  try {
    allowed.add(new URL(env.siteUrl).origin);
  } catch {
    // adresse du site mal formée : seule l'origine de la requête compte
  }
  return allowed.has(origin);
}

async function guard(request: Request) {
  if (!sameOrigin(request)) return { error: NextResponse.json({ error: 'Origine refusée.' }, { status: 403 }) };
  const viewer = await getViewer();
  if (!viewer) return { error: NextResponse.json({ error: 'Connecte-toi pour activer les notifications.' }, { status: 401 }) };
  return { viewer };
}

export async function POST(request: Request) {
  const checked = await guard(request);
  if ('error' in checked) return checked.error;
  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'Les notifications push ne sont pas encore activées sur ce site.' }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { subscription?: unknown } | null;
  const parsed = parseSubscription(body?.subscription);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await savePushSubscription(checked.viewer.profile.id, parsed.value, request.headers.get('user-agent'));
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const checked = await guard(request);
  if ('error' in checked) return checked.error;
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint) return NextResponse.json({ error: 'Adresse d’abonnement manquante.' }, { status: 400 });
  const removed = await removePushSubscription(checked.viewer.profile.id, endpoint);
  return NextResponse.json({ ok: true, removed });
}
