import { NextResponse, type NextRequest } from 'next/server';
import { LOCAL_SESSION_COOKIE, PROTECTED_PREFIXES } from '@/lib/auth/constants';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/connexion';
  url.search = `?suite=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!supabaseConfigured) {
    // Mode local : la signature du cookie est vérifiée côté serveur (lib/auth/session.ts).
    if (isProtected(pathname) && !request.cookies.get(LOCAL_SESSION_COOKIE)) return redirectToLogin(request);
    return NextResponse.next();
  }

  const { response, user } = await updateSupabaseSession(request);
  if (isProtected(pathname) && !user) return redirectToLogin(request);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api/|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:png|jpg|svg|webp|woff2)$).*)'],
};
