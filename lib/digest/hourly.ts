import { getRepo, type Repo } from '@/lib/db';
import { notify } from '@/lib/notify';
import { parisDate, parisHour } from '@/lib/utils';
import type { PersonalDigestContent } from './personal';
import { normalizeRecapSettings, RECAP_SETTINGS_KIND, type RecapSettings } from './settings';
import { isSunday, sendWeeklyRecap } from './weekly';
import { getPlan } from '@/lib/plans';

export interface RecapHourlyResult {
  morningPush: number;
  weekly: number;
  weeklyFailed: number;
}

/**
 * Tâche horaire des récaps (à appeler toutes les heures, même sans Discord) :
 * - push du récap du matin à l'heure choisie (récap préparé la nuit), pour ceux qui l'ont activé ;
 * - le dimanche, récap de la semaine à l'heure choisie, sur les canaux choisis (e-mail, Discord, push).
 * Chaque envoi est réservé une fois par jour (`claimDailyTask`) : une heure manquée est rattrapée la suivante, et deux
 * exécutions qui se chevauchent n'envoient jamais deux fois.
 */
export async function runRecapHourly(now: Date = new Date(), repo: Repo = getRepo()): Promise<RecapHourlyResult> {
  const day = parisDate(now);
  const hour = parisHour(now);
  const result: RecapHourlyResult = { morningPush: 0, weekly: 0, weeklyFailed: 0 };
  const settings = new Map(
    (await repo.listAllRecords<Partial<RecapSettings>>(RECAP_SETTINGS_KIND)).map((r) => [r.user_id, r.data] as const),
  );

  for (const [userId, raw] of settings) {
    if (!raw.matin?.push) continue;
    const profile = await repo.getProfile(userId);
    if (!profile?.onboarded_at || hour < profile.digest_hour) continue;
    // Récap du matin réservé aux abonnés, comme l'e-mail et Discord.
    if (!getPlan(profile.plan).access) continue;
    const digest = await repo.getDigest(userId, day);
    if (!digest) continue;
    if (!(await repo.claimDailyTask(`recap-matin-push:${userId}`, day))) continue;
    const content = digest.content as PersonalDigestContent;
    const top = content.products[0];
    const challenge = content.personal?.challenge;
    await notify(
      userId,
      {
        type: 'recap',
        title: 'Ton récap du matin est prêt',
        body: [top ? `N°1 : ${top.name}` : 'Tes produits du jour sont prêts.', challenge ? `Défi : ${challenge.text}` : null].filter(Boolean).join(' · '),
        path: '/app/recap',
        channels: { push: true },
      },
      repo,
    );
    result.morningPush++;
  }

  if (isSunday(day)) {
    for (const profile of await repo.listOnboardedProfiles()) {
      const sunday = normalizeRecapSettings(settings.get(profile.id), profile).dimanche;
      if (!sunday.email && !sunday.discord && !sunday.push) continue;
      if (hour < sunday.heure) continue;
      if (!(await repo.claimDailyTask(`recap-dimanche:${profile.id}`, day))) continue;
      try {
        await sendWeeklyRecap(profile, sunday, repo, now);
        result.weekly++;
      } catch (error) {
        await repo.releaseDailyTask(`recap-dimanche:${profile.id}`, day);
        console.error('[récap du dimanche]', profile.id, error instanceof Error ? error.message : error);
        result.weeklyFailed++;
      }
    }
  }
  return result;
}
