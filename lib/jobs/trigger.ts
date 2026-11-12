import { env } from '@/lib/env';
import { runNightly, type NightlyResult } from './nightly';

/**
 * Lance la tâche nocturne au bon endroit :
 * - sur Netlify (SITE_ID et URL fournis à l'exécution), dans la fonction d'arrière-plan
 *   `nightly-refresh-background`, qui dispose de 15 minutes, au lieu de la fonction de la route, plus courte ;
 * - ailleurs (local, tests, autre hébergeur), directement.
 */
export type TriggerResult = { queued: true } | { queued: false; result: NightlyResult };

export function runsOnNetlify(): boolean {
  return Boolean(process.env.SITE_ID && process.env.URL);
}

export async function triggerNightly(trigger: 'cron' | 'manuel', fetchImpl: typeof fetch = fetch): Promise<TriggerResult> {
  if (runsOnNetlify() && env.cronSecret) {
    const response = await fetchImpl(`${process.env.URL}/.netlify/functions/nightly-refresh-background`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.cronSecret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ trigger }),
    });
    // Une fonction d'arrière-plan répond 202 dès qu'elle est lancée (doc Netlify).
    if (response.status !== 202) throw new Error(`Lancement en arrière-plan refusé (HTTP ${response.status}).`);
    return { queued: true };
  }
  return { queued: false, result: await runNightly({ trigger }) };
}
