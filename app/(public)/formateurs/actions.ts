'use server';

import { createElement } from 'react';
import { z } from 'zod';
import { CoachApplicationEmail } from '@/emails/coach-application';
import { getRepo } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';

export interface PartnerState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  fields?: Record<string, string>;
}

const schema = z.object({
  name: z.string().trim().min(2, 'Indique ton nom (2 caractères minimum).').max(80),
  email: z.email('Cette adresse e-mail n’est pas valide.').max(160),
  training_name: z.string().trim().min(2, 'Indique le nom de ta formation.').max(120),
  audience_size: z.string().trim().max(60),
  message: z.string().trim().max(2000, 'Ton message est trop long (2 000 caractères maximum).'),
});

export async function submitPartnerRequest(_prev: PartnerState, formData: FormData): Promise<PartnerState> {
  // Champ piège invisible : un robot le remplit, un humain non.
  if (String(formData.get('site') ?? '')) return { status: 'ok' };
  const raw = {
    name: String(formData.get('nom') ?? ''),
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    training_name: String(formData.get('formation') ?? ''),
    audience_size: String(formData.get('audience') ?? ''),
    message: String(formData.get('message') ?? ''),
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Vérifie le formulaire.', fields: raw };
  }

  const application = await getRepo().insertCoachApplication(parsed.data);
  const to = env.founderEmail || env.adminEmails[0];
  if (to) {
    try {
      await sendEmail({
        to,
        subject: `Nouvelle demande formateur : ${application.training_name}`,
        react: createElement(CoachApplicationEmail, { application, siteUrl: env.siteUrl }),
      });
    } catch (error) {
      // La demande est enregistrée ; l'e-mail n'est qu'une notification.
      console.error('[partenariat] e-mail', error);
    }
  }
  return { status: 'ok' };
}
