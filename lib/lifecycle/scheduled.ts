import { Resend } from 'resend';
import { getRepo, type Repo } from '@/lib/db';
import { env, isResendConfigured } from '@/lib/env';

/**
 * E-mails programmés chez Resend (récaps, e-mails de cycle de vie) : leur identifiant est gardé jusqu'à l'heure d'envoi
 * (fiche `emails_programmes`), pour les annuler si le compte est supprimé avant (`POST /emails/{id}/cancel`, doc
 * Resend « Cancel Email ») : après une demande d'effacement, plus rien ne doit partir.
 */
export const SCHEDULED_EMAILS_KIND = 'emails_programmes';

interface ScheduledEmails {
  emails: Array<{ id: string; at: string }>;
}

export async function rememberScheduledEmail(userId: string, emailId: string, at: string, repo: Repo = getRepo(), now = new Date()) {
  const [record] = await repo.listRecords<ScheduledEmails>(userId, SCHEDULED_EMAILS_KIND);
  const kept = (record?.data.emails ?? []).filter((e) => e.at > now.toISOString() && e.id !== emailId);
  await repo.saveRecord(userId, SCHEDULED_EMAILS_KIND, { emails: [...kept, { id: emailId, at }].slice(-50) }, record?.id);
}

/** Annule les e-mails encore à venir. Renvoie le nombre d'annulations réussies ; une erreur n'arrête pas les autres. */
export async function cancelScheduledEmails(userId: string, repo: Repo = getRepo(), now = new Date()): Promise<number> {
  const [record] = await repo.listRecords<ScheduledEmails>(userId, SCHEDULED_EMAILS_KIND);
  const pending = (record?.data.emails ?? []).filter((e) => e.at > now.toISOString());
  if (!pending.length || !isResendConfigured()) return 0;
  const resend = new Resend(env.resendKey);
  let canceled = 0;
  for (const email of pending) {
    try {
      const { error } = await resend.emails.cancel(email.id);
      if (!error) canceled++;
    } catch (error) {
      console.warn('[suppression] annulation e-mail', email.id, error instanceof Error ? error.message : error);
    }
  }
  return canceled;
}
