import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { POST as oneClickRoute } from '@/app/api/recap/desinscription/route';
import { requestMagicLink } from '@/app/connexion/actions';
import { unsubscribeAction } from '@/app/desinscription/actions';
import { submitPartnerRequest } from '@/app/(public)/formateurs/actions';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { sendDigestEmail } from '@/lib/digest/deliver';
import { isLocalLoginAllowed, isPublicDeployment } from '@/lib/env';
import { unsubscribeToken, unsubscribeUrls, verifyUnsubscribeToken } from '@/lib/unsubscribe';
import { authConfigPatch, magicLinkTemplate, senderAddress } from '@/scripts/auth-setup';
import { MockProvider } from '@/lib/data/mock';
import { prepareDigests } from '@/lib/digest/prepare';
import { refreshCatalog } from '@/lib/jobs/refresh';

const repo = new LocalRepo(null);
const DAY = '2026-11-12';

beforeAll(async () => {
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: DAY });
});
afterAll(() => setRepoForTests(null));

function withEnv(values: Record<string, string>) {
  const before = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  Object.assign(process.env, values);
  return () => {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

/** next/navigation redirect() lève une erreur dont le digest contient l'adresse. */
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

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

describe('désinscription du récap', () => {
  it('le jeton est propre à chaque utilisateur et ne se devine pas', () => {
    const token = unsubscribeToken('user-a');
    expect(verifyUnsubscribeToken('user-a', token)).toBe(true);
    expect(verifyUnsubscribeToken('user-b', token)).toBe(false);
    expect(verifyUnsubscribeToken('user-a', 'faux')).toBe(false);
    expect(verifyUnsubscribeToken('user-a', '')).toBe(false);
    const links = unsubscribeUrls('user-a', 'https://tiktrend.fr');
    expect(links.page).toBe(`https://tiktrend.fr/desinscription?u=user-a&t=${token}`);
    expect(links.oneClick).toBe(`https://tiktrend.fr/api/recap/desinscription?u=user-a&t=${token}`);
  });

  it('le POST en un clic de la messagerie coupe le récap e-mail (corps vide, 200)', async () => {
    await repo.ensureProfile({ id: 'clic', email: 'clic@test.fr' });
    await repo.updateProfile('clic', { digest_email: true });
    const bad = await oneClickRoute(new Request('http://localhost/api/recap/desinscription?u=clic&t=faux', { method: 'POST' }));
    expect(bad.status).toBe(400);
    expect((await repo.getProfile('clic'))?.digest_email).toBe(true);

    const { oneClick } = unsubscribeUrls('clic', 'http://localhost');
    const response = await oneClickRoute(
      new Request(oneClick, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect((await repo.getProfile('clic'))?.digest_email).toBe(false);
  });

  it('le bouton de la page coupe le récap, un lien trafiqué est refusé', async () => {
    await repo.ensureProfile({ id: 'page', email: 'page@test.fr' });
    await repo.updateProfile('page', { digest_email: true });
    expect(await redirectedTo(() => unsubscribeAction(form({ u: 'page', t: 'faux' })))).toBe('/desinscription?etat=lien-invalide');
    expect((await repo.getProfile('page'))?.digest_email).toBe(true);
    expect(await redirectedTo(() => unsubscribeAction(form({ u: 'page', t: unsubscribeToken('page') })))).toBe('/desinscription?etat=fait');
    expect((await repo.getProfile('page'))?.digest_email).toBe(false);
  });
});

describe('envoi par Resend (requête HTTP simulée)', () => {
  let restore: () => void = () => {};
  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
  });

  it('le récap part avec la désinscription en un clic, l’heure programmée et une clé d’idempotence', async () => {
    restore = withEnv({ RESEND_API_KEY: 're_test_factice', EMAIL_FROM: 'TikTrend <recap@tiktrend.fr>', NEXT_PUBLIC_SITE_URL: 'https://tiktrend.fr' });
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'email_123' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await repo.ensureProfile({ id: 'resend', email: 'resend@test.fr' });
    await repo.updateProfile('resend', { niches: ['maison'], onboarded_at: new Date().toISOString(), digest_hour: 9 });
    await prepareDigests(DAY, repo);
    const profile = (await repo.getProfile('resend'))!;
    const digest = (await repo.getDigest('resend', DAY))!;
    const result = await sendDigestEmail(profile, digest, new Date('2026-11-12T03:00:00Z'));
    expect(result).toEqual({ id: 'email_123', mode: 'resend' });
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe('https://api.resend.com/emails');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer re_test_factice');
    expect(headers.get('idempotency-key')).toBe('recap-resend-2026-11-12');
    const body = JSON.parse(String(init.body));
    expect(body.from).toBe('TikTrend <recap@tiktrend.fr>');
    expect(body.to).toBe('resend@test.fr');
    expect(body.scheduled_at).toBe('2026-11-12T08:00:00.000Z');
    const token = unsubscribeToken('resend');
    expect(body.headers).toEqual({
      'List-Unsubscribe': `<https://tiktrend.fr/api/recap/desinscription?u=resend&t=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(body.html).toContain(`https://tiktrend.fr/desinscription?u=resend&amp;t=${token}`);
    expect(body.text).toContain('Ne plus recevoir le récap');
  });

  it('une demande de partenariat formateur prévient le fondateur', async () => {
    restore = withEnv({ RESEND_API_KEY: 're_test_factice', EMAIL_FROM: 'TikTrend <bonjour@tiktrend.fr>', FOUNDER_EMAIL: 'fondateur@tiktrend.fr' });
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: 'email_456' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const state = await submitPartnerRequest(
      { status: 'idle' },
      form({ nom: 'Camille Martin', email: 'camille@formation.fr', formation: 'Académie Shop', audience: '2 000 élèves', message: 'Bonjour' }),
    );
    expect(state.status).toBe('ok');
    expect(bodies).toHaveLength(1);
    expect(bodies[0].to).toBe('fondateur@tiktrend.fr');
    expect(bodies[0].subject).toBe('Nouvelle demande formateur : Académie Shop');
    expect(String(bodies[0].html)).toContain('camille@formation.fr');
  });
});

describe('lien magique affiché à l’écran', () => {
  let restore: () => void = () => {};
  afterEach(() => restore());

  it('reste permis en local', async () => {
    expect(isPublicDeployment()).toBe(false);
    expect(isLocalLoginAllowed()).toBe(true);
    const state = await requestMagicLink({ status: 'idle' }, form({ email: 'local@test.fr' }));
    expect(state.status).toBe('sent');
    expect(state.localLink).toMatch(/^\/auth\/callback\?token=/);
  });

  it('jamais sur un site déployé sans Supabase (Netlify ou adresse https publique)', async () => {
    restore = withEnv({ SITE_ID: 'site-netlify' });
    expect(isLocalLoginAllowed()).toBe(false);
    const state = await requestMagicLink({ status: 'idle' }, form({ email: 'pirate@test.fr' }));
    expect(state.status).toBe('error');
    expect(state.localLink).toBeUndefined();
    restore();
    restore = withEnv({ NEXT_PUBLIC_SITE_URL: 'https://tiktrend.fr' });
    expect(isPublicDeployment()).toBe(true);
    restore();
    restore = withEnv({ NEXT_PUBLIC_SITE_URL: 'https://localhost:3000' });
    expect(isPublicDeployment()).toBe(false);
  });
});

describe('réglage de l’auth Supabase (npm run auth:setup)', () => {
  it('modèle français avec lien token_hash, sans SMTP ni Google tant que les clés manquent', () => {
    const patch = authConfigPatch({ brand: 'TikTrend', siteUrl: 'https://tiktrend.fr/' });
    expect(patch.site_url).toBe('https://tiktrend.fr');
    expect(patch.uri_allow_list).toBe('https://tiktrend.fr/auth/callback**,http://localhost:3000/auth/callback**');
    expect(patch.mailer_subjects_magic_link).toBe('Ton lien de connexion TikTrend');
    expect(magicLinkTemplate('TikTrend')).toContain('{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email');
    expect(patch).not.toHaveProperty('smtp_host');
    expect(patch).not.toHaveProperty('external_google_enabled');
  });

  it('SMTP de Resend et Google quand leurs clés sont là', () => {
    const patch = authConfigPatch({
      brand: 'TikTrend',
      siteUrl: 'https://tiktrend.fr',
      resendKey: 're_x',
      emailFrom: 'TikTrend <bonjour@tiktrend.fr>',
      googleId: 'id.apps.googleusercontent.com',
      googleSecret: 'secret',
    });
    expect(patch).toMatchObject({
      smtp_host: 'smtp.resend.com',
      smtp_port: '465',
      smtp_user: 'resend',
      smtp_pass: 're_x',
      smtp_admin_email: 'bonjour@tiktrend.fr',
      smtp_sender_name: 'TikTrend',
      external_google_enabled: true,
      external_google_client_id: 'id.apps.googleusercontent.com',
    });
    expect(senderAddress('bonjour@tiktrend.fr')).toBe('bonjour@tiktrend.fr');
  });
});
