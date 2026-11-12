import { expireSimulatedTrials } from '@/lib/billing/simulated';
import type { Repo } from '@/lib/db';

/** Étapes lancées après le rafraîchissement nocturne. */
export async function afterRefreshHooks(_date: string, repo: Repo): Promise<Record<string, unknown>> {
  const expiredTrials = await expireSimulatedTrials(repo);
  return { expiredTrials };
}
