import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Outils des tests d'intégration contre un vrai projet Supabase.
 * Les clés viennent de l'environnement (.env.local) et ne sont jamais affichées.
 * Chaque exécution utilise un préfixe unique et nettoie tout ce qu'elle a créé.
 */

export const REQUIRED_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

export function missingVars(): string[] {
  return REQUIRED_VARS.filter((name) => !(process.env[name] ?? '').trim());
}

export const supabaseReady = missingVars().length === 0;

/** Préfixe propre à cette exécution : itest-<hex>. */
export const RUN = `itest-${randomBytes(4).toString('hex')}`;

/** Adresse de test : domaine réservé (RFC 2606), aucun e-mail réel n'est envoyé par ces tests. */
export function testEmail(label: string): string {
  return `${RUN}-${label}@example.com`.toLowerCase();
}

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function adminClient(): SupabaseClient {
  return createClient(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), noSession);
}

export function anonClient(): SupabaseClient {
  return createClient(url(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(), noSession);
}

export interface TestUser {
  id: string;
  email: string;
  /** Client avec la clé anon, connecté en tant que cet utilisateur (soumis à la RLS). */
  client: SupabaseClient;
}

/** Lien magique réel : génère le lien côté admin, puis le valide comme le ferait la page /auth/callback. */
export async function magicLinkTokenHash(email: string, redirectTo?: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (error) throw new Error(`generateLink : ${error.message}`);
  return data.properties.hashed_token;
}

export async function createTestUser(label: string): Promise<TestUser> {
  const email = testEmail(label);
  const admin = adminClient();
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser : ${created.error?.message}`);
  const client = anonClient();
  const tokenHash = await magicLinkTokenHash(email);
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  if (error) throw new Error(`verifyOtp : ${error.message}`);
  return { id: created.data.user.id, email, client };
}

/** Supprime tout ce que l'exécution a créé (utilisateurs en cascade, produits, lignes techniques). */
export async function cleanupRun(userIds: string[]): Promise<void> {
  const admin = adminClient();
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await admin.from('products').delete().like('id', `${RUN}%`);
  await admin.from('billing_events').delete().like('id', `${RUN}%`);
  await admin.from('coach_applications').delete().like('email', `${RUN}%`);
  await admin.from('cron_runs').delete().eq('job', RUN);
  await admin.from('provider_cache').delete().like('key', `${RUN}%`);
}

/** Code Postgres « permission refusée » ou violation de RLS. */
export const DENIED_CODES = new Set(['42501', 'PGRST301']);
