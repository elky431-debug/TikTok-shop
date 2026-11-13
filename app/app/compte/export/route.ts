import { relativeRedirect } from '@/lib/http/redirect';
import { getViewer } from '@/lib/auth/session';
import { buildDataExport, exportFileName } from '@/lib/rgpd';

export const dynamic = 'force-dynamic';

/** Téléchargement de toutes les données du compte connecté (RGPD : accès et portabilité), en JSON. */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return relativeRedirect('/connexion?suite=/app/compte%23donnees');
  const now = new Date();
  const body = JSON.stringify(await buildDataExport(viewer.profile.id, undefined, now), null, 2);
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFileName(now)}"`,
      'cache-control': 'no-store',
    },
  });
}
