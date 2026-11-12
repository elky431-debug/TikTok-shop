import { expireSimulatedTrials } from '@/lib/billing/simulated';
import type { Repo } from '@/lib/db';
import { scheduleDigestEmails } from '@/lib/digest/deliver';

/** Étapes lancées après le rafraîchissement nocturne. */
export async function afterRefreshHooks(date: string, repo: Repo): Promise<Record<string, unknown>> {
  const expiredTrials = await expireSimulatedTrials(repo);
  const emails = await scheduleDigestEmails(date, repo);
  return { expiredTrials, emails };
}
