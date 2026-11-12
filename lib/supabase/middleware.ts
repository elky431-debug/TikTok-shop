import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Rafraîchit la session Supabase et renvoie l'utilisateur (ou null), et si Supabase était injoignable. */
export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  // Supabase injoignable (panne, réseau) : on ne conclut pas à « déconnecté ». Sinon, un utilisateur connecté
  // tournerait en rond entre /connexion (qui, côté serveur, le voit connecté) et la page demandée. Chaque page
  // protégée revérifie la session côté serveur (requireViewer), qui reste la vraie barrière.
  const unreachable = error?.name === 'AuthRetryableFetchError';
  return { response, user, unreachable };
}
