import { runDiscordHourly } from '../../lib/discord/jobs';

/**
 * Fonction d'arrière-plan Netlify (réponse 202 immédiate, puis jusqu'à 15 minutes) : la tâche horaire Discord.
 * Sans « Authorization: Bearer <CRON_SECRET> », elle ne fait rien.
 */
export default async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    console.error('[discord] appel refusé : CRON_SECRET absent ou invalide.');
    return;
  }
  try {
    const result = await runDiscordHourly();
    console.log(
      `[discord] terminé : ${result.dms.sent} récap(s) privé(s), ${result.dms.failed} échec(s) ; salons : ${result.channels} ; ` +
        `rôles : ${result.roles ?? 'rien à faire'}.`,
    );
  } catch (error) {
    console.error(`[discord] échec : ${error instanceof Error ? error.message : String(error)}`);
  }
};
