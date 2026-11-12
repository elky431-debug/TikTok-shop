import { NextResponse, type NextRequest } from 'next/server';
import { LOCAL_SESSION_COOKIE, PROTECTED_PREFIXES } from '@/lib/auth/constants';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

/**
 * Le middleware tourne en fonction Edge (Netlify). Il ne lit que les deux variables publiques, recopiées dans le code au
 * moment du build : il ne dépend pas de la clé secrète, qui peut ne pas être visible côté Edge. Sinon il se croirait en
 * mode local et renverrait vers /connexion un utilisateur pourtant connecté par Supabase (boucle).
 */
const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/connexion';
  url.search = `?suite=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

/**
 * Un lien de connexion qui retombe sur l'accueil (adresse de retour refusée par Supabase, qui renvoie alors vers sa
 * « Site URL ») porte `?code=` ou `?token_hash=&type=` : on l'envoie à la route de retour au lieu de montrer l'accueil.
 */
function strandedAuthRedirect(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (request.nextUrl.pathname !== '/') return null;
  if (!params.get('code') && !(params.get('token_hash') && params.get('type'))) return null;
  const url = request.nextUrl.clone();
  url.pathname = '/auth/callback';
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const stranded = strandedAuthRedirect(request);
  if (stranded) return stranded;

  if (!supabaseConfigured) {
    // Mode local : la signature du cookie est vérifiée côté serveur (lib/auth/session.ts).
    if (isProtected(pathname) && !request.cookies.get(LOCAL_SESSION_COOKIE)) return redirectToLogin(request);
    return NextResponse.next();
  }

  const { response, user, unreachable } = await updateSupabaseSession(request);
  if (isProtected(pathname) && !user && !unreachable) return redirectToLogin(request);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api/|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:png|jpg|svg|webp|woff2)$).*)'],
};
