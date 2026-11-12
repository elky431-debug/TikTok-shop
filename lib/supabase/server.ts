import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Client Supabase lié aux cookies de la requête (clé anon) : sert uniquement à l'authentification
 * (lien magique, Google, lecture de la session). Les données passent par `lib/db`.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Appelé depuis un composant serveur : le middleware rafraîchit déjà la session.
        }
      },
    },
  });
}
