import { expireSimulatedTrials } from '@/lib/billing/simulated';
import type { Repo } from '@/lib/db';
import { scheduleDigestEmails } from '@/lib/digest/deliver';
import { radarNightly } from '@/lib/radar/nightly';
import { alertDecliningProducts } from '@/lib/v2/decline';
import { sendOfferFollowUps } from '@/lib/v2/offers';

/** Étapes lancées après le rafraîchissement nocturne. */
export async function afterRefreshHooks(date: string, repo: Repo): Promise<Record<string, unknown>> {
  const expiredTrials = await expireSimulatedTrials(repo);
  const emails = await scheduleDigestEmails(date, repo);
  // Les rappels de publication partent de la tâche horaire (à l'heure de chacun, tous canaux, via notify).
  // Phrases « Pourquoi maintenant » du catalogue, puis alertes personnalisées (notify : push, e-mail, Discord).
  const radar = await radarNightly(date, repo);
  const declines = await alertDecliningProducts(date, repo);
  const offerFollowUps = await sendOfferFollowUps(date, repo);
  return { expiredTrials, emails, radar, declineAlerts: declines.alerts, offerFollowUps };
}
