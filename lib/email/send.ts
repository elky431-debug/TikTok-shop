import { render } from '@react-email/render';
import type { ReactElement } from 'react';
import { Resend } from 'resend';
import { BRAND } from '@/lib/brand';
import { getRepo } from '@/lib/db';
import { env, isResendConfigured } from '@/lib/env';

export interface SendResult {
  id: string | null;
  mode: 'resend' | 'local';
}

let resend: Resend | null = null;

/**
 * Envoie un e-mail via Resend. Sans clé : journalisé en console et rangé dans la boîte locale
 * (visible dans /admin en mode local). Jamais d'échec silencieux : une erreur Resend est levée.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  react: ReactElement;
  scheduledAt?: string;
  headers?: Record<string, string>;
}): Promise<SendResult> {
  const html = await render(input.react);
  const text = await render(input.react, { plainText: true });

  if (!isResendConfigured()) {
    console.info(`[e-mail local] À ${input.to} · ${input.subject}${input.scheduledAt ? ` · programmé ${input.scheduledAt}` : ''}`);
    const repo = getRepo();
    if (repo.logLocalEmail) {
      await repo.logLocalEmail({ to: input.to, subject: input.subject, html, scheduled_at: input.scheduledAt ?? null });
    }
    return { id: null, mode: 'local' };
  }

  resend ??= new Resend(env.resendKey);
  const { data, error } = await resend.emails.send({
    from: env.emailFrom || `${BRAND} <onboarding@resend.dev>`,
    to: input.to,
    subject: input.subject,
    html,
    text,
    scheduledAt: input.scheduledAt,
    headers: input.headers,
  });
  if (error) throw new Error(`Resend : ${error.message}`);
  return { id: data?.id ?? null, mode: 'resend' };
}
