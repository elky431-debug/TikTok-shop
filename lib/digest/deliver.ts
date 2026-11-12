import { createElement } from 'react';
import { MorningDigestEmail } from '@/emails/morning-digest';
import { getRepo, type Repo } from '@/lib/db';
import type { Digest, Profile } from '@/lib/db/types';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { getPlan } from '@/lib/plans';
import { rememberScheduledEmail } from '@/lib/lifecycle/scheduled';
import { unsubscribeHeaders, unsubscribeUrls } from '@/lib/unsubscribe';
import { parisTimeToUtc } from '@/lib/utils';

export function digestSubject(digest: Digest): string {
  const top = digest.content.products[0];
  return top ? `Ton n°1 du jour : ${top.name}` : 'Tes produits du jour sont prêts';
}

/**
 * Programme l'e-mail du récap de chaque utilisateur à l'heure qu'il a choisie (Resend « scheduledAt »).
 * Une seule tâche nocturne suffit : pas de cron horaire nécessaire.
 */
export async function scheduleDigestEmails(day: string, repo: Repo = getRepo(), now = new Date()): Promise<{ scheduled: number; sent: number; failed: number }> {
  const digests = await repo.listDigests(day);
  const stats = { scheduled: 0, sent: 0, failed: 0 };
  for (const digest of digests) {
    if (digest.email_status !== 'pending') continue;
    const profile = await repo.getProfile(digest.user_id);
    if (!profile || !profile.digest_email || !getPlan(profile.plan).emailDigest) {
      await repo.updateDigestStatus(digest.user_id, day, { email_status: 'skipped' });
      continue;
    }
    try {
      await sendDigestEmail(profile, digest, now);
      const due = parisTimeToUtc(day, profile.digest_hour);
      const immediate = due.getTime() <= now.getTime() + 60_000;
      await repo.updateDigestStatus(digest.user_id, day, { email_status: immediate ? 'sent' : 'scheduled' });
      if (immediate) stats.sent++;
      else stats.scheduled++;
    } catch (error) {
      console.error('[récap e-mail]', profile.id, error);
      await repo.updateDigestStatus(digest.user_id, day, { email_status: 'failed' });
      stats.failed++;
    }
  }
  return stats;
}

/**
 * Un e-mail de récap, programmé à l'heure choisie. Désinscription en un clic (RFC 8058, comme le demande la doc
 * Resend) : List-Unsubscribe vers une adresse qui accepte un POST, List-Unsubscribe-Post, et un lien visible.
 * Clé d'idempotence par utilisateur et par jour : même relancée, la tâche n'envoie jamais deux récaps.
 */
export async function sendDigestEmail(profile: Profile, digest: Digest, now = new Date()) {
  const due = parisTimeToUtc(digest.day, profile.digest_hour);
  const scheduledAt = due.getTime() > now.getTime() + 60_000 ? due.toISOString() : undefined;
  const links = unsubscribeUrls(profile.id);
  const result = await sendEmail({
    to: profile.email,
    subject: digestSubject(digest),
    react: createElement(MorningDigestEmail, { content: digest.content, siteUrl: env.siteUrl, unsubscribeUrl: links.page }),
    scheduledAt,
    headers: unsubscribeHeaders(profile.id, 'matin'),
    idempotencyKey: `recap-${profile.id}-${digest.day}`,
  });
  // Gardé pour annuler l'envoi si le compte est supprimé avant l'heure prévue.
  if (scheduledAt && result.id) await rememberScheduledEmail(profile.id, result.id, scheduledAt).catch(() => undefined);
  return result;
}
