import type { EmailOtpType } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { finishLogin } from '@/lib/auth/after-login';
import { LOCAL_SESSION_COOKIE, NEXT_PATH_COOKIE } from '@/lib/auth/constants';
import { createLocalSessionToken } from '@/lib/auth/local-session';
import { getLocalRepo } from '@/lib/db';
import { isLocalLoginAllowed, isLocalMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function fail(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/connexion?erreur=${reason}`, request.url));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  // Page demandée : dans l'adresse (mot de passe, Google), sinon dans le cookie posé à la demande du lien magique.
  const next = params.get('suite') ?? cookies().get(NEXT_PATH_COOKIE)?.value ?? null;
  cookies().delete(NEXT_PATH_COOKIE);

  if (isLocalMode()) {
    if (!isLocalLoginAllowed()) return fail(request, 'session');
    const token = params.get('token');
    if (!token) return fail(request, 'lien');
    const user = await getLocalRepo().consumeMagicToken(token);
    if (!user) return fail(request, 'lien-expire');
    cookies().set(LOCAL_SESSION_COOKIE, createLocalSessionToken(user), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' && request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    const destination = await finishLogin(user, next);
    return NextResponse.redirect(new URL(destination, request.url));
  }

  const supabase = createSupabaseServerClient();
  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(request, 'lien-expire');
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail(request, 'lien-expire');
  } else {
    return fail(request, 'lien');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(request, 'session');
  const destination = await finishLogin({ id: user.id, email: user.email ?? '' }, next);
  return NextResponse.redirect(new URL(destination, request.url));
}
