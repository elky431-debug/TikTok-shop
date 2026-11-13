import { relativeRedirect } from '@/lib/http/redirect';
import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { parisDate } from '@/lib/utils';

/** Export texte de tous les scripts (plan Elite uniquement, vérifié côté serveur). */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return relativeRedirect('/connexion?suite=/app/studio');
  if (!getPlan(viewer.profile.plan).export) {
    return NextResponse.json({ error: 'L’export est réservé au plan Elite.' }, { status: 403 });
  }
  const scripts = await getRepo().listScripts(viewer.profile.id, { limit: 500 });
  const body = scripts
    .sort((a, b) => Number(b.saved) - Number(a.saved))
    .map((s) => `${s.saved ? '★ ' : ''}${s.created_at.slice(0, 10)}\n${s.full_text}`)
    .join('\n\n────────────────────────\n\n');
  return new NextResponse(body || 'Aucun script pour l’instant.', {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="scripts-${parisDate()}.txt"`,
    },
  });
}
