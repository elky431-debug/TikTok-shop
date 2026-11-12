import { expireSimulatedTrials } from '@/lib/billing/simulated';
import type { Repo } from '@/lib/db';
import { scheduleDigestEmails } from '@/lib/digest/deliver';
import { schedulePublicationEmails } from '@/lib/v2/reminders';

/** Étapes lancées après le rafraîchissement nocturne. */
export async function afterRefreshHooks(date: string, repo: Repo): Promise<Record<string, unknown>> {
  const expiredTrials = await expireSimulatedTrials(repo);
  const emails = await scheduleDigestEmails(date, repo);
  const publicationReminders = await schedulePublicationEmails(date, repo);
  return { expiredTrials, emails, publicationReminders };
}
