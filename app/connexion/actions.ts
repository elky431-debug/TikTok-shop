'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { finishLogin } from '@/lib/auth/after-login';
import { LOCAL_SESSION_COOKIE, NEXT_PATH_COOKIE } from '@/lib/auth/constants';
import { createLocalSessionToken } from '@/lib/auth/local-session';
import { requestOrigin } from '@/lib/auth/origin';
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/auth/password';
import { safeNextPath } from '@/lib/auth/redirects';
import { getLocalRepo } from '@/lib/db';
import { isLocalLoginAllowed, isLocalMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LoginState {
  status: 'idle' | 'sent' | 'error' | 'confirm';
  message?: string;
  email?: string;
  /** Mode local uniquement : le lien magique est affiché au lieu d'être envoyé. */
  localLink?: string;
}

const emailSchema = z.email();
const NOT_CONFIGURED = 'La connexion n’est pas encore configurée sur ce site. Réessaie plus tard.';

function readEmail(formData: FormData): { email: string; error?: LoginState } {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!email) return { email, error: { status: 'error', message: 'Indique ton adresse e-mail.' } };
  if (!emailSchema.safeParse(email).success) {
    return { email, error: { status: 'error', email, message: "Cette adresse e-mail n'est pas valide (exemple : prenom@gmail.com)." } };
  }
  return { email };
}

/** Retour de connexion : `/auth/callback` de l'adresse par laquelle l'utilisateur est arrivé (local, Netlify, domaine). */
function callbackUrl(suite: string): string {
  return `${requestOrigin()}/auth/callback?suite=${encodeURIComponent(suite)}`;
}

/** Ouvre la session du mode local (cookie signé), comme le fait la route de retour du lien magique. */
function setLocalSession(user: { id: string; email: string }) {
  cookies().set(LOCAL_SESSION_COOKIE, createLocalSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && requestOrigin().startsWith('https://'),
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Messages Supabase Auth (codes documentés de `AuthApiError.code`) en français. */
function authMessage(error: { code?: string; status?: number; message: string }): string {
  switch (error.code) {
    case 'user_already_exists':
    case 'email_exists':
      return 'Un compte existe déjà avec cette adresse : connecte-toi avec ton mot de passe, ou reçois un lien de connexion.';
    case 'invalid_credentials':
      return 'E-mail ou mot de passe incorrect.';
    case 'email_not_confirmed':
      return 'Ton adresse n’est pas encore confirmée : ouvre l’e-mail de confirmation, ou reçois un lien de connexion.';
    case 'weak_password':
      return 'Ce mot de passe est trop faible : allonge-le ou mélange lettres, chiffres et symboles.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Trop de demandes en peu de temps. Réessaie dans quelques minutes.';
    case 'email_address_not_authorized':
      return 'L’envoi d’e-mails n’est pas encore activé sur ce site : crée ton compte avec un mot de passe.';
    case 'email_address_invalid':
      return 'Cette adresse e-mail est refusée : utilise ta vraie adresse.';
    case 'signup_disabled':
      return 'Les inscriptions sont fermées pour le moment.';
    default:
      if (error.status === 429) return 'Trop de demandes en peu de temps. Réessaie dans quelques minutes.';
      return `La connexion n’a pas abouti : ${error.message}`;
  }
}

/** Création de compte par e-mail et mot de passe. Sans confirmation d'e-mail, le compte est ouvert tout de suite. */
export async function signUpWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const { email, error } = readEmail(formData);
  if (error) return error;
  const password = String(formData.get('password') ?? '');
  const suite = safeNextPath(String(formData.get('suite') ?? ''), '/app');
  const weak = passwordProblem(password);
  if (weak) return { status: 'error', email, message: weak };

  let user: { id: string; email: string };
  if (isLocalMode()) {
    if (!isLocalLoginAllowed()) return { status: 'error', email, message: NOT_CONFIGURED };
    const created = await getLocalRepo().createPasswordUser(email, hashPassword(password));
    if (!created) return { status: 'error', email, message: authMessage({ code: 'user_already_exists', message: '' }) };
    setLocalSession(created);
    user = created;
  } else {
    // Si la confirmation d'e-mail est active, le lien de l'e-mail ramène ici ; la page demandée suit dans un cookie.
    cookies().set(NEXT_PATH_COOKIE, suite, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 });
    const { data, error: signUpError } = await createSupabaseServerClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${requestOrigin()}/auth/callback` },
    });
    if (signUpError) return { status: 'error', email, message: authMessage(signUpError) };
    // Adresse déjà inscrite : Supabase renvoie un utilisateur sans identité (pour ne pas révéler les comptes existants).
    if (data.user && data.user.identities?.length === 0) {
      return { status: 'error', email, message: authMessage({ code: 'user_already_exists', message: '' }) };
    }
    if (!data.session || !data.user) {
      return { status: 'confirm', email, message: 'Compte créé : ouvre l’e-mail de confirmation pour l’activer.' };
    }
    user = { id: data.user.id, email: data.user.email ?? email };
  }
  redirect(await finishLogin(user, suite));
}

/** Connexion par e-mail et mot de passe. */
export async function signInWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const { email, error } = readEmail(formData);
  if (error) return error;
  const password = String(formData.get('password') ?? '');
  const suite = safeNextPath(String(formData.get('suite') ?? ''), '/app');
  if (!password) return { status: 'error', email, message: 'Indique ton mot de passe.' };

  let user: { id: string; email: string };
  if (isLocalMode()) {
    if (!isLocalLoginAllowed()) return { status: 'error', email, message: NOT_CONFIGURED };
    const found = await getLocalRepo().findLocalUserByEmail(email);
    if (!found || !verifyPassword(password, found.password_hash)) {
      return { status: 'error', email, message: authMessage({ code: 'invalid_credentials', message: '' }) };
    }
    setLocalSession(found);
    user = found;
  } else {
    const { data, error: signInError } = await createSupabaseServerClient().auth.signInWithPassword({ email, password });
    if (signInError || !data.user) return { status: 'error', email, message: authMessage(signInError ?? { message: 'session absente' }) };
    user = { id: data.user.id, email: data.user.email ?? email };
  }
  redirect(await finishLogin(user, suite));
}

/** Lien magique (sans mot de passe). Avec Supabase, il demande un SMTP configuré (Resend). */
export async function requestMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const { email, error } = readEmail(formData);
  if (error) return error;
  const suite = safeNextPath(String(formData.get('suite') ?? ''), '/app');

  if (isLocalMode()) {
    if (!isLocalLoginAllowed()) return { status: 'error', email, message: NOT_CONFIGURED };
    const token = await getLocalRepo().createMagicToken(email);
    return { status: 'sent', email, localLink: `/auth/callback?token=${token}&suite=${encodeURIComponent(suite)}` };
  }

  // La page demandée voyage dans un cookie : le lien de l'e-mail ne la transporte pas forcément.
  cookies().set(NEXT_PATH_COOKIE, suite, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 });
  const { error: otpError } = await createSupabaseServerClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${requestOrigin()}/auth/callback` },
  });
  if (otpError) return { status: 'error', email, message: authMessage(otpError) };
  return { status: 'sent', email };
}

export async function signInWithGoogle(formData: FormData) {
  const suite = safeNextPath(String(formData.get('suite') ?? ''), '/app');
  if (isLocalMode()) redirect('/connexion?erreur=google-local');
  const { data, error } = await createSupabaseServerClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl(suite) },
  });
  if (error || !data.url) redirect('/connexion?erreur=google');
  redirect(data.url);
}
