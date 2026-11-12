import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { getRepo } from '@/lib/db';
import { runNightly } from '@/lib/jobs/nightly';
import { parisDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Tâche nocturne. vercel.json l'appelle une fois par jour à 3 h UTC (4 h à Paris l'hiver, 5 h l'été), avec
 * « Authorization: Bearer <CRON_SECRET> » envoyé par Vercel. Un second appel le même jour (relance de Vercel,
 * appel à la main) ne refait pas le travail, sauf avec `?force=1` (admin, tests).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Non autorisé : en-tête Authorization manquant ou invalide.' }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get('force') === '1';

  if (!force) {
    const [last] = await getRepo().listCronRuns(1);
    if (last?.job === 'refresh' && last.status === 'ok' && parisDate(new Date(last.started_at)) === parisDate()) {
      return NextResponse.json({ skipped: true, reason: 'Déjà exécutée aujourd’hui.' });
    }
  }

  try {
    const result = await runNightly({ trigger: force ? 'manuel' : 'cron' });
    return NextResponse.json({
      ok: true,
      date: result.refresh.date,
      provider: result.refresh.provider,
      products: result.refresh.products,
      digests: result.digests.prepared,
      fallbacks: result.fallbacks.map((f) => f.provider),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[tâche nocturne] échec : ${message}`);
    return NextResponse.json({ ok: false, error: 'La tâche nocturne a échoué : voir l’historique dans /admin.' }, { status: 500 });
  }
}
