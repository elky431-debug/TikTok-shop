import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { getRepo } from '@/lib/db';
import { triggerNightly } from '@/lib/jobs/trigger';
import { parisDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Tâche nocturne. La fonction planifiée Netlify (netlify/functions/nightly-refresh.mts) l'appelle une fois par jour
 * à 3 h UTC (4 h à Paris l'hiver, 5 h l'été), avec « Authorization: Bearer <CRON_SECRET> ». Sur Netlify, le travail
 * part dans la fonction d'arrière-plan (réponse 202) ; ailleurs, il est fait ici. Un second appel le même jour ne
 * refait pas le travail, sauf avec `?force=1` (admin, tests).
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
    const outcome = await triggerNightly(force ? 'manuel' : 'cron');
    if (outcome.queued) return NextResponse.json({ ok: true, queued: true }, { status: 202 });
    const result = outcome.result;
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
