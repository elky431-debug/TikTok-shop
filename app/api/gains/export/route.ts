import { getViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { parisDate } from '@/lib/utils';
import { earningsToCsv, EARNINGS_KIND, type EarningData } from '@/lib/v2/earnings';

export const dynamic = 'force-dynamic';

/** Export CSV des gains pour la comptabilité (son propriétaire seulement, plans avec suivi des gains). Aucun conseil fiscal. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.profile || !getPlan(viewer.profile.plan).earnings) return new Response('Non autorisé', { status: 401 });
  const records = await getRepo().listRecords<EarningData>(viewer.profile.id, EARNINGS_KIND);
  return new Response(earningsToCsv(records.map((r) => r.data)), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="gains-${parisDate()}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
