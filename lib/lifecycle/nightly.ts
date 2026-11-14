import { getLiveCatalog } from '@/lib/catalog';
import { getRepo, type Repo } from '@/lib/db';
import { trackPostedVideos } from '@/lib/digest/history';
import { pruneNotifications } from '@/lib/notification-center';
import { rankForUser } from '@/lib/radar-rules';
import { commissionPerSale } from '@/lib/score';
import { parisDate, parisTimeToUtc } from '@/lib/utils';
import { dueLifecycleEmails, needsScriptCount, pickTonight } from './engine';
import { getDisabledLifecycle } from './preferences';
import { getLifecycleLog, saveLifecycleLog, sendLifecycleEmail } from './send';
import { LIFECYCLE_INFO, type LifecycleType } from './types';
import { displayName } from '@/lib/product-name';

/** Heure d'arrivée des e-mails de cycle de vie (heure de Paris) : pas au milieu de la nuit, pas en même temps que le récap. */
export const LIFECYCLE_SEND_HOUR = 11;

export interface LifecycleNightlyResult {
  sent: Partial<Record<LifecycleType, number>>;
  failed: number;
}

/**
 * Tâche nocturne des e-mails de cycle de vie (à brancher après le rafraîchissement) : pour chaque compte, ce qui est dû
 * ce jour-là (voir engine.ts), moins ce qui est coupé ou déjà parti, programmé chez Resend pour 11 h (heure de Paris).
 * Chaque envoi est réservé pour le jour (`claimDailyTask`) puis noté dans le journal du compte : jamais deux fois.
 */
export async function runLifecycleNightly(date: string = parisDate(), repo: Repo = getRepo(), now = new Date()): Promise<LifecycleNightlyResult> {
  const result: LifecycleNightlyResult = { sent: {}, failed: 0 };
  const due = parisTimeToUtc(date, LIFECYCLE_SEND_HOUR);
  const scheduledAt = due.getTime() > now.getTime() + 60_000 ? due.toISOString() : undefined;
  let catalog: Awaited<ReturnType<typeof getLiveCatalog>> | null = null;

  for (const profile of await repo.listOnboardedProfiles()) {
    const subscription = await repo.getActiveSubscription(profile.id);
    // Suivi des incidents de paiement : premier jour vu « past_due », oublié dès que l'abonnement n'y est plus.
    const { log, id } = await getLifecycleLog(profile.id, repo);
    const pastDue = subscription?.status === 'past_due' ? subscription.id : null;
    const tracked = Object.keys(log.past_due);
    if ((pastDue && !log.past_due[pastDue]) || tracked.some((k) => k !== pastDue)) {
      log.past_due = pastDue ? { [pastDue]: log.past_due[pastDue] ?? date } : {};
      await saveLifecycleLog(profile.id, log, id, repo);
    }

    const ctx = {
      profile,
      scripts: needsScriptCount({ profile, now }) ? await repo.countScripts(profile.id) : null,
      subscription,
      pastDueSince: pastDue ? log.past_due[pastDue] : null,
      now,
    };
    const disabled = await getDisabledLifecycle(profile.id, repo);
    // Un seul conseil par jour, même si la tâche est relancée la même nuit.
    const adviceToday = Object.values(log.sent).some((e) => LIFECYCLE_INFO[e.type]?.group === 'conseils' && parisDate(new Date(e.at)) === date);
    const tonight = pickTonight(
      dueLifecycleEmails(ctx).filter(
        (d) => !disabled.has(d.type) && !log.sent[d.key] && !(adviceToday && LIFECYCLE_INFO[d.type].group === 'conseils'),
      ),
    );

    for (const email of tonight) {
      const task = `cycle:${email.key}:${profile.id}`;
      if (!(await repo.claimDailyTask(task, date))) continue;
      try {
        const extra: Parameters<typeof sendLifecycleEmail>[3] = {};
        if (email.type === 'fin_essai') {
          extra.trialEnd = subscription?.trial_end ?? null;
          extra.coachName = profile.coach_id ? ((await repo.getCoachById(profile.coach_id))?.training_name ?? null) : null;
        }
        if (email.type === 'reactivation') {
          catalog ??= await getLiveCatalog(repo, now);
          // Jamais de produits fictifs ni de relevé de plus de 36 heures dans un e-mail.
          if (!catalog.demo && !catalog.stale) {
            extra.products = rankForUser(catalog.products, profile.niches)
              .slice(0, 3)
              .map((p) => ({ id: p.id, name: displayName(p), commission_cents: commissionPerSale(p.price_cents, p.commission_rate) }));
          }
        }
        if (await sendLifecycleEmail(profile, email.type, email.key, extra, { repo, scheduledAt, now })) {
          result.sent[email.type] = (result.sent[email.type] ?? 0) + 1;
        }
      } catch (error) {
        await repo.releaseDailyTask(task, date);
        console.error('[cycle de vie]', email.type, profile.id, error instanceof Error ? error.message : error);
        result.failed++;
      }
    }
  }
  return result;
}

/**
 * Tout le travail nocturne de ce périmètre, en un appel (signature `(date, repo) => résumé` des autres étapes) :
 * relevé des vidéos postées (série, récap du dimanche), e-mails de cycle de vie, ménage du centre de notifications.
 */
export async function runEngagementNightly(date: string = parisDate(), repo: Repo = getRepo()) {
  const now = new Date();
  const videos = await trackPostedVideos(date, repo, now);
  const lifecycle = await runLifecycleNightly(date, repo, now);
  const notificationsPruned = await pruneNotifications(repo, now);
  return { videos, lifecycle, notificationsPruned };
}
