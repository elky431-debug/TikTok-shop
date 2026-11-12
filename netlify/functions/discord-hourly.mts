/**
 * Fonction planifiée Netlify : toutes les heures (minute 0, en UTC), appelle /api/cron/discord avec CRON_SECRET.
 * La route lance le travail dans discord-hourly-background (réponse 202) : récaps en message privé à l'heure choisie
 * par chacun, salons « produits du jour », rôles Pro. Rien à héberger ailleurs : le bot n'a pas de processus permanent.
 */
export default async (req: Request) => {
  const { next_run } = (await req.json().catch(() => ({}))) as { next_run?: string };
  const site = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!site || !secret) {
    console.error('[discord] URL ou CRON_SECRET absent : rien n’est lancé.');
    return;
  }
  try {
    const response = await fetch(`${site}/api/cron/discord`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    console.log(`[discord] /api/cron/discord → HTTP ${response.status}. Prochaine exécution : ${next_run ?? 'inconnue'}.`);
  } catch (error) {
    console.error(`[discord] appel impossible : ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const config = { schedule: '0 * * * *' };
