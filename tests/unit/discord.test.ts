import { generateKeyPairSync, sign } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as interactionsRoute } from '@/app/api/discord/interactions/route';
import { GET as discordCron } from '@/app/api/cron/discord/route';
import { handleBillingEvent } from '@/lib/billing/events';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { prepareDigests } from '@/lib/digest/prepare';
import { createDiscordLinkCode } from '@/lib/discord';
import { DISCORD_COMMANDS } from '@/lib/discord/interactions';
import { runDiscordHourly } from '@/lib/discord/jobs';
import { setDiscordFetchForTests } from '@/lib/discord/rest';
import { refreshCatalog } from '@/lib/jobs/refresh';

/**
 * Discord sans clé ni réseau : les interactions sont signées avec une vraie paire Ed25519 et passent par la vraie route ;
 * les appels à l'API REST de Discord sont enregistrés (méthode, chemin, corps) par un faux fetch.
 */
const DAY = '2026-11-12';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_HEX = Buffer.from(publicKey.export({ format: 'jwk' }).x!, 'base64url').toString('hex');

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  auth: string | null;
}
let calls: Call[] = [];
let failDmFor = new Set<string>();
let repo: LocalRepo;

function fakeDiscord(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const path = String(url).replace('https://discord.com/api/v10', '');
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  const method = init?.method ?? 'GET';
  calls.push({ method, path, body, auth: new Headers(init?.headers).get('authorization') });
  if (method === 'POST' && path === '/users/@me/channels') {
    const recipient = String(body?.recipient_id);
    if (failDmFor.has(recipient)) return Promise.resolve(Response.json({ code: 50007, message: 'Cannot send messages to this user' }, { status: 403 }));
    return Promise.resolve(Response.json({ id: `dm-${recipient}`, type: 1 }));
  }
  if (method === 'POST' && path.endsWith('/messages')) return Promise.resolve(Response.json({ id: 'msg' }));
  return Promise.resolve(new Response(null, { status: 204 }));
}

function signed(body: unknown, key = privateKey) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.from(timestamp + raw), key).toString('hex');
  return new Request('https://tracktout.com/api/discord/interactions', {
    method: 'POST',
    body: raw,
    headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp, 'content-type': 'application/json' },
  });
}

const command = (name: string, userId: string, options?: Array<{ name: string; type: number; value: string }>) => ({
  type: 2,
  data: { name, type: 1, ...(options ? { options } : {}) },
  member: { user: { id: userId } },
});

beforeAll(() => {
  Object.assign(process.env, {
    DISCORD_PUBLIC_KEY: PUBLIC_HEX,
    DISCORD_APPLICATION_ID: '111111111111111111',
    DISCORD_BOT_TOKEN: 'jeton-factice',
    DISCORD_GUILD_ID: '222222222222222222',
    DISCORD_PRO_ROLE_ID: '333333333333333333',
    DISCORD_PUBLIC_CHANNEL_ID: '444444444444444444',
    DISCORD_PRO_CHANNEL_ID: '555555555555555555',
    NEXT_PUBLIC_SITE_URL: 'https://tracktout.com',
  });
  setDiscordFetchForTests(fakeDiscord as typeof fetch);
});

afterAll(() => {
  setDiscordFetchForTests(null);
  setRepoForTests(null);
  for (const k of ['DISCORD_PUBLIC_KEY', 'DISCORD_APPLICATION_ID', 'DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_PRO_ROLE_ID', 'DISCORD_PUBLIC_CHANNEL_ID', 'DISCORD_PRO_CHANNEL_ID', 'NEXT_PUBLIC_SITE_URL']) {
    delete process.env[k];
  }
});

beforeEach(async () => {
  calls = [];
  failDmFor = new Set();
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});

const rolePath = (user: string) => `/guilds/222222222222222222/members/${user}/roles/333333333333333333`;

describe('interactions HTTP (/api/discord/interactions)', () => {
  it('répond au PING de vérification de Discord et refuse toute signature invalide (401)', async () => {
    const pong = await interactionsRoute(signed({ type: 1 }));
    expect(pong.status).toBe(200);
    expect(await pong.json()).toEqual({ type: 1 });

    const other = generateKeyPairSync('ed25519').privateKey;
    expect((await interactionsRoute(signed({ type: 1 }, other))).status).toBe(401);
    const tampered = signed({ type: 1 });
    const forged = new Request(tampered.url, { method: 'POST', body: JSON.stringify({ type: 2 }), headers: tampered.headers });
    expect((await interactionsRoute(forged)).status).toBe(401);
    expect((await interactionsRoute(new Request(tampered.url, { method: 'POST', body: '{"type":1}' }))).status).toBe(401);
  });

  it('/lier associe le compte (réponse visible de l’auteur seul) et donne le rôle Pro ; /delier le retire', async () => {
    await repo.ensureProfile({ id: 'ines', email: 'ines@test.fr' });
    await repo.updateProfile('ines', { plan: 'pro', first_name: 'Inès' });
    const { code } = await createDiscordLinkCode('ines');

    const linked = await (await interactionsRoute(signed(command('lier', '987654321098765432', [{ name: 'code', type: 3, value: code.toLowerCase() }])))).json();
    expect(linked.type).toBe(4);
    expect(linked.data.flags).toBe(64);
    expect(linked.data.content).toContain('C’est lié, Inès');
    expect(await repo.getProfile('ines')).toMatchObject({ discord_user_id: '987654321098765432', digest_discord: true });
    expect(calls).toContainEqual(expect.objectContaining({ method: 'PUT', path: rolePath('987654321098765432'), auth: 'Bot jeton-factice' }));

    const reused = await (await interactionsRoute(signed(command('lier', '987654321098765432', [{ name: 'code', type: 3, value: code }])))).json();
    expect(reused.data.content).toContain('invalide ou a expiré');

    const unlinked = await (await interactionsRoute(signed(command('delier', '987654321098765432')))).json();
    expect(unlinked.data.content).toContain('Liaison retirée');
    expect((await repo.getProfile('ines'))?.discord_user_id).toBeNull();
    expect(calls).toContainEqual(expect.objectContaining({ method: 'DELETE', path: rolePath('987654321098765432') }));
  });

  it('déclare les commandes avec des noms et options conformes à la doc (32 caractères, 25 choix, obligatoires d’abord)', () => {
    expect(DISCORD_COMMANDS.map((c) => c.name)).toEqual(['lier', 'delier', 'produits', 'score', 'script', 'alerte', 'classement']);
    expect(DISCORD_COMMANDS[0].options).toEqual([expect.objectContaining({ type: 3, name: 'code', required: true })]);
    for (const c of DISCORD_COMMANDS) {
      expect(c.name).toMatch(/^[a-z_-]{1,32}$/);
      expect(c.description.length).toBeLessThanOrEqual(100);
      const options = ('options' in c ? c.options : []) as ReadonlyArray<{ name: string; description: string; required?: boolean; choices?: unknown[]; autocomplete?: boolean }>;
      const firstOptional = options.findIndex((o) => !o.required);
      if (firstOptional >= 0) expect(options.slice(firstOptional).every((o) => !o.required)).toBe(true);
      for (const o of options) {
        expect(o.name).toMatch(/^[a-z0-9_-]{1,32}$/);
        expect(o.description.length).toBeLessThanOrEqual(100);
        expect((o.choices ?? []).length).toBeLessThanOrEqual(25);
        expect(Boolean(o.autocomplete && o.choices)).toBe(false);
      }
    }
    expect(JSON.stringify(DISCORD_COMMANDS).length).toBeLessThan(8000);
  });
});

describe('tâche horaire Discord', () => {
  beforeEach(async () => {
    // Deux jours de relevés : le salon public montre ceux de la veille.
    await refreshCatalog({ repo, provider: new MockProvider(), date: DAY, backfillDays: 2 });
    for (const [id, plan, hour, discord] of [
      ['pro9', 'pro', 9, '100000000000000001'],
      ['pro7', 'pro', 7, '100000000000000002'],
      ['ferme', 'pro', 7, '100000000000000003'],
      ['gratuit', 'free', 7, '100000000000000004'],
    ] as const) {
      await repo.ensureProfile({ id, email: `${id}@test.fr` });
      await repo.updateProfile(id, { plan, niches: ['maison'], onboarded_at: '2026-11-01T00:00:00Z', digest_hour: hour, discord_user_id: discord, digest_discord: plan !== 'free' });
    }
    await prepareDigests(DAY, repo);
    failDmFor.add('100000000000000003');
  });

  it('envoie chaque récap en message privé à l’heure choisie, une seule fois par jour', async () => {
    // 7 h à Paris (6 h UTC en hiver) : seuls ceux de 7 h ; avant 8 h, pas encore de salons.
    const seven = await runDiscordHourly({ repo, now: new Date(`${DAY}T06:00:00Z`) });
    expect(seven.dms).toEqual({ sent: 1, failed: 1 });
    expect(seven.channels).toBe('pas-encore');
    const dm = calls.find((c) => c.path === '/users/@me/channels');
    expect(dm?.body).toEqual({ recipient_id: '100000000000000002' });
    const message = calls.find((c) => c.path === '/channels/dm-100000000000000002/messages')!;
    const embed = (message.body!.embeds as Array<Record<string, unknown>>)[0];
    expect(embed.title).toBe('Voici tes produits du jour');
    expect(message.body!.components).toEqual([
      { type: 1, components: [{ type: 2, style: 5, label: 'Ouvrir mon radar', url: 'https://tracktout.com/app' }] },
    ]);
    expect((await repo.getDigest('ferme', DAY))?.discord_status).toBe('failed');
    expect((await repo.getDigest('gratuit', DAY))?.discord_status).toBe('skipped');

    calls = [];
    const nine = await runDiscordHourly({ repo, now: new Date(`${DAY}T08:00:00Z`) });
    expect(nine.dms).toEqual({ sent: 1, failed: 0 });
    expect(calls.filter((c) => c.path === '/users/@me/channels').map((c) => c.body)).toEqual([{ recipient_id: '100000000000000001' }]);
    calls = [];
    expect((await runDiscordHourly({ repo, now: new Date(`${DAY}T09:00:00Z`) })).dms).toEqual({ sent: 0, failed: 0 });
  });

  it('publie les salons une fois par jour : la veille sans score en public, le jour complet en Pro', async () => {
    const first = await runDiscordHourly({ repo, now: new Date(`${DAY}T07:00:00Z`) });
    expect(first.channels).toBe('publies');
    const publicPost = calls.find((c) => c.path === '/channels/444444444444444444/messages')!;
    const proPost = calls.find((c) => c.path === '/channels/555555555555555555/messages')!;
    const embed = (publicPost.body!.embeds as Array<{ title: string; description: string }>)[0];
    expect(embed.title).toBe('Les produits d’hier (produits fictifs, démonstration)');
    expect(embed.description).toContain('Relevé du 11 novembre');
    expect(embed.description).not.toContain('/100');
    expect(embed.description).not.toContain('/app/produit/');
    const proText = String((proPost.body!.embeds as Array<{ description: string }>)[0].description);
    expect(proText).toContain('https://tracktout.com/app/produit/');
    expect(proText).toContain('/100');
    calls = [];
    expect((await runDiscordHourly({ repo, now: new Date(`${DAY}T10:00:00Z`) })).channels).toBe('deja');
    expect(calls.some((c) => c.path.startsWith('/channels/4'))).toBe(false);
  });

  it('synchronise le rôle Pro une fois par jour, et tout de suite quand le plan change', async () => {
    const run = await runDiscordHourly({ repo, now: new Date(`${DAY}T07:00:00Z`) });
    expect(run.roles).toBe(4);
    expect(calls).toContainEqual(expect.objectContaining({ method: 'PUT', path: rolePath('100000000000000001') }));
    expect(calls).toContainEqual(expect.objectContaining({ method: 'DELETE', path: rolePath('100000000000000004') }));
    expect((await runDiscordHourly({ repo, now: new Date(`${DAY}T08:00:00Z`) })).roles).toBeNull();

    calls = [];
    await handleBillingEvent({
      kind: 'subscription', eventId: 'evt_role', provider: 'stripe', subscriptionId: 'sub_g', customerId: null, userId: 'gratuit',
      status: 'active', plan: 'pro', interval: 'month', priceId: null, currentPeriodEnd: null, trialEnd: null, cancelAtPeriodEnd: false,
    }, repo);
    expect(calls).toEqual([expect.objectContaining({ method: 'PUT', path: rolePath('100000000000000004') })]);
  });

  it('la route horaire est protégée par CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-cron');
    expect((await discordCron(new Request('https://tracktout.com/api/cron/discord'))).status).toBe(401);
    const ok = await discordCron(new Request('https://tracktout.com/api/cron/discord', { headers: { authorization: 'Bearer secret-cron' } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, dms: { sent: expect.any(Number) } });
    vi.unstubAllEnvs();
  });
});
