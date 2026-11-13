import { expireSimulatedTrials } from '@/lib/billing/simulated';
import type { Repo } from '@/lib/db';
import { scheduleDigestEmails } from '@/lib/digest/deliver';
import { alertDecliningProducts } from '@/lib/v2/decline';
import { sendOfferFollowUps } from '@/lib/v2/offers';

/** Étapes lancées après le rafraîchissement nocturne. */
export async function afterRefreshHooks(date: string, repo: Repo): Promise<Record<string, unknown>> {
  const expiredTrials = await expireSimulatedTrials(repo);
  const emails = await scheduleDigestEmails(date, repo);
  // Les rappels de publication partent de la tâche horaire (à l'heure de chacun, tous canaux, via notify).
  const declines = await alertDecliningProducts(date, repo);
  const offerFollowUps = await sendOfferFollowUps(date, repo);
  return { expiredTrials, emails, declineAlerts: declines.alerts, offerFollowUps };
}
