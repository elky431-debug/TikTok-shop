import { createElement } from 'react';
import { LifecycleEmail, lifecycleSubject, type LifecycleEmailProps } from '@/emails/lifecycle';
import { getRepo, type Repo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { isPaidPlan } from '@/lib/plans';
import { unsubscribeHeaders, unsubscribeUrls } from '@/lib/unsubscribe';
import { getDisabledLifecycle } from './preferences';
import { rememberScheduledEmail } from './scheduled';
import { LIFECYCLE_INFO, type LifecycleType } from './types';

/**
 * Journal des e-mails de cycle de vie d'un compte (fiche `cycle_vie_envois`) : ce qui est parti (une seule fois par
 * clé), et le premier jour où un abonnement a été vu en retard de paiement (pour la relance).
 */
export const LIFECYCLE_LOG_KIND = 'cycle_vie_envois';

export interface LifecycleLog {
  sent: Record<string, { type: LifecycleType; at: string; email_id: string | null }>;
  past_due: Record<string, string>;
}

export async function getLifecycleLog(userId: string, repo: Repo = getRepo()): Promise<{ log: LifecycleLog; id: string | null }> {
  const [record] = await repo.listRecords<LifecycleLog>(userId, LIFECYCLE_LOG_KIND);
  return { log: { sent: { ...(record?.data.sent ?? {}) }, past_due: { ...(record?.data.past_due ?? {}) } }, id: record?.id ?? null };
}

export async function saveLifecycleLog(userId: string, log: LifecycleLog, id: string | null, repo: Repo = getRepo()) {
  return repo.saveRecord(userId, LIFECYCLE_LOG_KIND, log, id ?? undefined);
}

/**
 * Envoie un e-mail de cycle de vie, sauf s'il est coupé ou déjà parti pour cette clé. Lien de désinscription en un clic
 * de sa famille (RFC 8058), clé d'idempotence Resend. Renvoie false si rien n'est parti.
 */
export async function sendLifecycleEmail(
  profile: Profile,
  type: LifecycleType,
  key: string,
  extra: Pick<LifecycleEmailProps, 'trialEnd' | 'coachName' | 'products'> = {},
  options: { repo?: Repo; scheduledAt?: string; now?: Date } = {},
): Promise<boolean> {
  const repo = options.repo ?? getRepo();
  if ((await getDisabledLifecycle(profile.id, repo)).has(type)) return false;
  const { log, id } = await getLifecycleLog(profile.id, repo);
  if (log.sent[key]) return false;

  const list = LIFECYCLE_INFO[type].group;
  const props: LifecycleEmailProps = {
    type,
    firstName: profile.first_name,
    siteUrl: env.siteUrl,
    unsubscribeUrl: unsubscribeUrls(profile.id, env.siteUrl, list).page,
    freePlan: !isPaidPlan(profile.plan),
    ...extra,
  };
  const result = await sendEmail({
    to: profile.email,
    subject: lifecycleSubject(type, props),
    react: createElement(LifecycleEmail, props),
    scheduledAt: options.scheduledAt,
    headers: unsubscribeHeaders(profile.id, list),
    idempotencyKey: `cycle-${key}-${profile.id}`.slice(0, 256),
  });
  log.sent[key] = { type, at: (options.now ?? new Date()).toISOString(), email_id: result.id };
  await saveLifecycleLog(profile.id, log, id, repo);
  if (options.scheduledAt && result.id) await rememberScheduledEmail(profile.id, result.id, options.scheduledAt, repo).catch(() => undefined);
  return true;
}
