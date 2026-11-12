import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/auth/password';
import { originFrom } from '@/lib/auth/origin';
import { getLocalRepo, setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { authConfigPatch, cleanOrigin, confirmationTemplate } from '@/scripts/auth-setup';

/** Inscription et connexion par mot de passe (mode local), liens qui retombent sur l'accueil, réglages Supabase. */
const cookieJar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
  headers: () => new Headers({ host: 'localhost:3000' }),
}));

const repo = new LocalRepo(null);
beforeAll(() => setRepoForTests(repo));
afterAll(() => setRepoForTests(null));

async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const digest = String((error as { digest?: string }).digest ?? '');
    const match = /;([^;]+);\d+;?$/.exec(digest) ?? /;(\/[^;]+)/.exec(digest);
    if (match) return match[1];
    throw error;
  }
  throw new Error('aucune redirection');
}

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

describe('mots de passe (mode local)', () => {
  it('hache avec un sel et vérifie en temps constant', () => {
    const stored = hashPassword('motdepasse-solide');
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(hashPassword('motdepasse-solide')).not.toBe(stored);
    expect(verifyPassword('motdepasse-solide', stored)).toBe(true);
    expect(verifyPassword('autre', stored)).toBe(false);
    expect(verifyPassword('x', undefined)).toBe(false);
    expect(passwordProblem('court')).toMatch(/au moins 8/);
    expect(passwordProblem('assez-long')).toBeNull();
  });

  it('inscription → session ouverte → onboarding ; une adresse déjà prise est refusée ; connexion et mauvais mot de passe', async () => {
    const { signUpWithPassword, signInWithPassword } = await import('@/app/connexion/actions');
    // Les comptes du mode local vivent dans le fichier local (getLocalRepo) : une adresse neuve à chaque exécution.
    const email = `nouvelle-${Date.now()}@test.fr`;
    expect(await redirectedTo(() => signUpWithPassword({ status: 'idle' }, form({ email, password: 'motdepasse-solide', suite: '/app' })))).toBe('/bienvenue');
    expect([...cookieJar.keys()]).toContain('tracktout_session');
    expect((await getLocalRepo().findLocalUserByEmail(email))?.password_hash).toBeTruthy();

    const again = await signUpWithPassword({ status: 'idle' }, form({ email, password: 'motdepasse-solide' }));
    expect(again).toMatchObject({ status: 'error', message: expect.stringContaining('Un compte existe déjà') });
    expect(await signUpWithPassword({ status: 'idle' }, form({ email: 'x@test.fr', password: 'court' }))).toMatchObject({ status: 'error', message: expect.stringContaining('8 caractères') });

    cookieJar.clear();
    expect(await redirectedTo(() => signInWithPassword({ status: 'idle' }, form({ email, password: 'motdepasse-solide', suite: '/app' })))).toBe('/bienvenue');
    expect(cookieJar.get('tracktout_session')).toBeTruthy();
    expect(await signInWithPassword({ status: 'idle' }, form({ email, password: 'mauvais' }))).toMatchObject({ status: 'error', message: 'E-mail ou mot de passe incorrect.' });
  });
});

describe('liens de connexion', () => {
  it('un lien qui retombe sur l’accueil est renvoyé à la route de retour', async () => {
    const { middleware } = await import('@/middleware');
    for (const query of ['?code=abc', '?token_hash=xyz&type=email']) {
      const response = await middleware(new NextRequest(`https://tracktout.com/${query}`));
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(`https://tracktout.com/auth/callback${query}`);
    }
    const plain = await middleware(new NextRequest('https://tracktout.com/'));
    expect(plain.headers.get('location')).toBeNull();
  });

  it('calcule l’adresse d’origine de la demande', () => {
    expect(originFrom('localhost:3000', null)).toBe('http://localhost:3000');
    expect(originFrom('mon-site.netlify.app', 'https')).toBe('https://mon-site.netlify.app');
    expect(originFrom(null, 'https')).toBeNull();
  });
});

describe('réglages Supabase (npm run auth:setup)', () => {
  it('autorise chaque adresse du site et coupe ou remet la confirmation d’e-mail', () => {
    const patch = authConfigPatch({
      brand: 'Tracktout',
      siteUrl: 'https://tracktout.com',
      extraOrigins: ['https://mon-site.netlify.app/', 'pas une adresse', ''],
      emailConfirmation: false,
    });
    expect(patch.uri_allow_list).toBe('https://tracktout.com/auth/callback**,https://mon-site.netlify.app/auth/callback**,http://localhost:3000/auth/callback**');
    expect(patch.mailer_autoconfirm).toBe(true);
    expect(authConfigPatch({ brand: 'T', siteUrl: 'https://t.fr', emailConfirmation: true }).mailer_autoconfirm).toBe(false);
    expect(confirmationTemplate('Tracktout')).toContain('{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email');
    expect(cleanOrigin('https://tracktout.com/')).toBe('https://tracktout.com');
    expect(cleanOrigin('javascript:alert(1)')).toBeNull();
  });
});
