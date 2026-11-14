import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { REFERRAL_COOKIE } from '@/lib/auth/constants';
import { normalizeCode } from '@/lib/referral';

/** Lien direct d'un formateur : mémorise le code 30 jours puis envoie vers l'inscription. */
export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeCode(decodeURIComponent(params.code));
  if (code) {
    cookies().set(REFERRAL_COOKIE, code, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return NextResponse.redirect(new URL(code ? `/connexion?code=${code}` : '/connexion', request.url));
}
