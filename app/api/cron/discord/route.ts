import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { isDiscordConfigured } from '@/lib/discord/config';
import { triggerDiscordHourly } from '@/lib/jobs/trigger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Tâche horaire Discord, appelée toutes les heures par netlify/functions/discord-hourly.mts avec
 * « Authorization: Bearer <CRON_SECRET> » : récaps en message privé à l'heure de chacun, salons du jour, rôles.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Non autorisé : en-tête Authorization manquant ou invalide.' }, { status: 401 });
  }
  if (!isDiscordConfigured()) return NextResponse.json({ skipped: true, reason: 'Discord n’est pas configuré.' });
  try {
    const outcome = await triggerDiscordHourly();
    if (outcome.queued) return NextResponse.json({ ok: true, queued: true }, { status: 202 });
    return NextResponse.json({ ok: true, ...outcome.result });
  } catch (error) {
    console.error(`[discord] tâche horaire : ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false, error: 'La tâche Discord a échoué.' }, { status: 500 });
  }
}
