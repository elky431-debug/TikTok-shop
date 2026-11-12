import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { getRepo } from '@/lib/db';
import { runNightly } from '@/lib/jobs/nightly';
import { parisDate, parisHour } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Tâche nocturne. Vercel Cron ne gère pas les fuseaux : vercel.json l'appelle à 2 h et 3 h UTC,
 * et seule l'exécution qui tombe à 4 h, heure de Paris, travaille (été comme hiver).
 * `?force=1` lance le traitement immédiatement (admin, tests).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Non autorisé : en-tête Authorization manquant ou invalide.' }, { status: 401 });
  }
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const hour = parisHour();

  if (!force && hour !== 4) {
    return NextResponse.json({ skipped: true, reason: `Il est ${hour} h à Paris, la tâche tourne à 4 h.` });
  }

  if (!force) {
    // Double déclenchement le même jour : on ne refait pas le travail.
    const [last] = await getRepo().listCronRuns(1);
    if (last?.job === 'refresh' && last.status === 'ok' && parisDate(new Date(last.started_at)) === parisDate()) {
      return NextResponse.json({ skipped: true, reason: 'Déjà exécutée aujourd’hui.' });
    }
  }

  try {
    const result = await runNightly({ trigger: force ? 'manuel' : 'cron' });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
