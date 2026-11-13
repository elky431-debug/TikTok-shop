import { getRepo, type Repo } from '@/lib/db';
import { checkAlerts } from './alerts';
import { prepareWhyNow } from './why-now';

/**
 * Traitements de nuit du radar, à lancer après le relevé (lib/jobs/hooks.ts, `afterRefreshHooks`) :
 *  1. phrases « Pourquoi maintenant » de tout le catalogue du jour (une génération par produit et par jour) ;
 *  2. vérification des alertes personnalisées (notifications push, e-mail, Discord).
 * Une étape en échec n'empêche pas l'autre ; le résumé va dans l'historique de la tâche.
 */
export async function radarNightly(date: string, repo: Repo = getRepo()): Promise<Record<string, unknown>> {
  const step = async <T>(run: () => Promise<T>) => {
    try {
      return await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[radar de nuit]', message);
      return { erreur: message };
    }
  };
  const pourquoi_maintenant = await step(() => prepareWhyNow(date, repo));
  const alertes = await step(() => checkAlerts(date, repo));
  return { pourquoi_maintenant, alertes };
}
