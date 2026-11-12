import { afterAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient, cleanupRun, magicLinkTokenHash, supabaseReady, testEmail } from './helpers';

/** Authentification réelle, au niveau de l'API Supabase (le parcours navigateur est dans e2e/auth.spec.ts). */
describe.skipIf(!supabaseReady)('Authentification Supabase', () => {
  const created: string[] = [];

  afterAll(async () => {
    if (supabaseReady) await cleanupRun(created);
  });

  it('un lien magique crée le compte et le profil, puis ouvre une session', async () => {
    const email = testEmail('lien');
    const client = anonClient();
    const tokenHash = await magicLinkTokenHash(email);
    const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    expect(error).toBeNull();
    expect(data.user?.email).toBe(email);
    created.push(data.user!.id);
    const profile = await client.from('profiles').select('email, plan').single();
    expect(profile.data).toEqual({ email, plan: 'free' });
  });

  it('un lien magique ne sert qu’une fois', async () => {
    const email = testEmail('lien-unique');
    const tokenHash = await magicLinkTokenHash(email);
    const first = await anonClient().auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    expect(first.error).toBeNull();
    created.push(first.data.user!.id);
    const second = await anonClient().auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    expect(second.error).not.toBeNull();
  });

  it('la déconnexion révoque la session', async () => {
    const email = testEmail('deconnexion');
    const client = anonClient();
    const tokenHash = await magicLinkTokenHash(email);
    const { data } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    created.push(data.user!.id);
    const refreshToken = data.session!.refresh_token;
    await client.auth.signOut();
    const reuse = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
    expect(reuse.error).not.toBeNull();
  });

  it('le serveur refuse un jeton forgé', async () => {
    const { data, error } = await adminClient().auth.getUser('jeton.invalide.test');
    expect(data.user).toBeNull();
    expect(error).not.toBeNull();
  });
});
