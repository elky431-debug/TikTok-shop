import { getViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { env } from '@/lib/env';
import { getPlan } from '@/lib/plans';
import { planToIcs, type PublicationPlan } from '@/lib/v2/planning';

export const dynamic = 'force-dynamic';

/** Export .ics du plan de publication (son propriétaire seulement). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.profile || !getPlan(viewer.profile.plan).planning) return new Response('Non autorisé', { status: 401 });
  const record = await getRepo().getRecord<PublicationPlan>(viewer.profile.id, params.id);
  if (!record) return new Response('Plan introuvable', { status: 404 });
  return new Response(planToIcs(record.data, record.id, env.siteUrl), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="plan-${record.id.slice(0, 8)}.ics"`,
      'cache-control': 'private, no-store',
    },
  });
}
