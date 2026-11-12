import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { TestEmail } from '@/emails/test-email';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';

/** Vrai envoi par Resend : un e-mail de test au premier administrateur (ADMIN_EMAILS). Ignoré sans clé. */
const ready = Boolean(env.resendKey && env.emailFrom && env.adminEmails[0]);

describe.skipIf(!ready)('Resend (envoi réel)', () => {
  it('envoie un e-mail de test à l’administrateur', async () => {
    const sentAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const result = await sendEmail({
      to: env.adminEmails[0],
      subject: 'Test d’envoi : les e-mails partent bien',
      react: createElement(TestEmail, { siteUrl: env.siteUrl, sentAt }),
      idempotencyKey: `test-integration-${Date.now()}`,
    });
    expect(result.mode).toBe('resend');
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
