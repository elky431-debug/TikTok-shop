import { runNightly } from '../../lib/jobs/nightly';

/**
 * Fonction d'arrière-plan Netlify (suffixe « -background » : réponse 202 immédiate, puis jusqu'à 15 minutes de
 * travail). Exécute la tâche nocturne complète : relevé des produits, score, récaps, envois.
 * Elle peut être appelée par URL : sans « Authorization: Bearer <CRON_SECRET> », elle ne fait rien.
 */
export default async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    console.error('[tâche nocturne] appel refusé : CRON_SECRET absent ou invalide.');
    return;
  }
  const { trigger } = (await req.json().catch(() => ({}))) as { trigger?: 'cron' | 'manuel' };
  try {
    const result = await runNightly({ trigger: trigger === 'manuel' ? 'manuel' : 'cron' });
    console.log(
      `[tâche nocturne] terminée : ${result.refresh.products} produits (${result.refresh.provider}), ` +
        `${result.digests.prepared} récaps${result.fallbacks.length ? `, repli après ${result.fallbacks.length} échec(s)` : ''}.`,
    );
  } catch (error) {
    // L'erreur est aussi écrite dans l'historique des tâches (écran admin) par runNightly.
    console.error(`[tâche nocturne] échec : ${error instanceof Error ? error.message : String(error)}`);
  }
};
