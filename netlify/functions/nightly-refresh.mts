/**
 * Fonction planifiée Netlify : chaque jour à 3 h UTC (4 h à Paris l'hiver, 5 h l'été), appelle
 * /api/cron/refresh avec CRON_SECRET. Une fonction planifiée ne dispose que de 30 secondes (doc Netlify) : la
 * route ne fait que lancer la tâche en arrière-plan (fonction nightly-refresh-background, 15 minutes au plus).
 * URL est fourni par Netlify à l'exécution (adresse principale du site) ; CRON_SECRET se règle dans l'interface.
 */
export default async (req: Request) => {
  const { next_run } = (await req.json().catch(() => ({}))) as { next_run?: string };
  const site = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!site || !secret) {
    console.error('[tâche nocturne] URL ou CRON_SECRET absent : rien n’est lancé.');
    return;
  }
  try {
    const response = await fetch(`${site}/api/cron/refresh`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    console.log(`[tâche nocturne] /api/cron/refresh → HTTP ${response.status}. Prochaine exécution : ${next_run ?? 'inconnue'}.`);
  } catch (error) {
    console.error(`[tâche nocturne] appel impossible : ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const config = { schedule: '0 3 * * *' };
