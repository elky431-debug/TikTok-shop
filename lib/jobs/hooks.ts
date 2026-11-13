import { expireSimulatedTrials } from '@/lib/billing/simulated';
import type { Repo } from '@/lib/db';
import { scheduleDigestEmails } from '@/lib/digest/deliver';
import { recordDailyMetrics } from '@/lib/admin/metrics';
import { runEngagementNightly } from '@/lib/lifecycle/nightly';
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
  // Vidéos postées (séries), e-mails de cycle de vie, ménage des notifications ; indicateurs de l'admin.
  const engagement = await runEngagementNightly(date, repo);
  const metrics = await recordDailyMetrics(repo).then(() => 'ok', (error: unknown) => (error instanceof Error ? error.message : 'échec'));
  return { expiredTrials, emails, radar, declineAlerts: declines.alerts, offerFollowUps, engagement, metrics };
}
