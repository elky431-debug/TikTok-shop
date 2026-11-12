'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { safeNextPath } from '@/lib/auth/redirects';
import { getLocalRepo } from '@/lib/db';
import { env, isLocalLoginAllowed, isLocalMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LoginState {
  status: 'idle' | 'sent' | 'error';
  message?: string;
  email?: string;
  /** Mode local uniquement : le lien magique est affiché au lieu d'être envoyé. */
  localLink?: string;
}

const emailSchema = z.email();

export async function requestMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const suite = safeNextPath(String(formData.get('suite') ?? ''), '/app');

  if (!email) return { status: 'error', message: 'Indique ton adresse e-mail pour recevoir ton lien.' };
  if (!emailSchema.safeParse(email).success) {
    return { status: 'error', email, message: "Cette adresse e-mail n'est pas valide (exemple : prenom@gmail.com)." };
  }

  if (isLocalMode()) {
    if (!isLocalLoginAllowed()) {
      return { status: 'error', email, message: 'La connexion n’est pas encore configurée sur ce site. Réessaie plus tard.' };
    }
    const token = await getLocalRepo().createMagicToken(email);
    return {
      status: 'sent',
      email,
      localLink: `/auth/callback?token=${token}&suite=${encodeURIComponent(suite)}`,
    };
  }

  const { error } = await createSupabaseServerClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${env.siteUrl}/auth/callback?suite=${encodeURIComponent(suite)}` },
  });
  if (error) {
    if (error.status === 429) {
      return { status: 'error', email, message: 'Trop de demandes en peu de temps. Réessaie dans une minute.' };
    }
    return { status: 'error', email, message: `Le lien n'a pas pu partir : ${error.message}` };
  }
  return { status: 'sent', email };
}

export async function signInWithGoogle(formData: FormData) {
  const suite = safeNextPath(String(formData.get('suite') ?? ''), '/app');
  if (isLocalMode()) redirect('/connexion?erreur=google-local');
  const { data, error } = await createSupabaseServerClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${env.siteUrl}/auth/callback?suite=${encodeURIComponent(suite)}` },
  });
  if (error || !data.url) redirect('/connexion?erreur=google');
  redirect(data.url);
}
