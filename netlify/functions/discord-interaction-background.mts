import { isFollowupJob, runDiscordFollowup } from '../../lib/discord/followup';

/**
 * Fonction d'arrière-plan Netlify (réponse 202 immédiate, puis jusqu'à 15 minutes) : réponses différées des commandes
 * Discord qui appellent l'IA (/script). La route /api/discord/interactions a déjà répondu « réfléchit… » (type 5) ;
 * ici on écrit l'accroche puis on modifie cette réponse avec le jeton de l'interaction (valable 15 minutes).
 * Sans « Authorization: Bearer <CRON_SECRET> », elle ne fait rien.
 */
export default async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    console.error('[discord] réponse différée refusée : CRON_SECRET absent ou invalide.');
    return;
  }
  const job = await req.json().catch(() => null);
  if (!isFollowupJob(job)) {
    console.error('[discord] réponse différée : demande invalide.');
    return;
  }
  const outcome = await runDiscordFollowup(job);
  console.log(`[discord] réponse différée /script : ${outcome}.`);
};
