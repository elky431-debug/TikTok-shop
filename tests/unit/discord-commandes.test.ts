import { generateKeyPairSync, sign } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/netlify/functions/discord-interaction-background.mts';
import { POST as interactionsRoute } from '@/app/api/discord/interactions/route';
import { setStructuredRunnerForTests } from '@/lib/ai/structured';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { Product } from '@/lib/db/types';
import { COMMAND_KIND } from '@/lib/discord/account';
import { ALERT_KIND, matchesAlerte, parseAlerte, sales7d, type AlerteData } from '@/lib/discord/alerte';
import { searchProducts } from '@/lib/discord/catalog';
import { isFollowupJob, setFollowupFetchForTests, waitForDiscordFollowups } from '@/lib/discord/followup';
import { leaderboardEntries, postWeeklyLeaderboard, setStreakSource, streakDays, SETTINGS_KIND } from '@/lib/discord/leaderboard';
import { setDiscordFetchForTests } from '@/lib/discord/rest';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { rankForUser } from '@/lib/radar-rules';

/**
 * Commandes du bot (bloc 10) sans réseau : interactions signées par une vraie paire Ed25519, appels à l'API de Discord
 * enregistrés par un faux fetch, IA remplacée par un faux fournisseur quand il le faut.
 */
const DAY = '2026-11-12';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_HEX = Buffer.from(publicKey.export({ format: 'jwk' }).x!, 'base64url').toString('hex');
const APP = '111111111111111111';

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  auth: string | null;
}
let calls: Call[] = [];
let repo: LocalRepo;

function fakeDiscord(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const path = String(url).replace('https://discord.com/api/v10', '');
  calls.push({
    method: init?.method ?? 'GET',
    path,
    body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    auth: new Headers(init?.headers).get('authorization'),
  });
  return Promise.resolve(Response.json({ id: 'msg' }));
}

function signed(body: unknown) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.from(timestamp + raw), privateKey).toString('hex');
  return new Request('https://tracktout.com/api/discord/interactions', {
    method: 'POST',
    body: raw,
    headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp, 'content-type': 'application/json' },
  });
}

type Opt = { name: string; type: number; value: unknown; focused?: boolean };
const interaction = (type: number, name: string, userId: string, options: Opt[] = []) => ({
  id: '900000000000000001',
  application_id: APP,
  token: 'jeton-interaction-de-test_123',
  type,
  data: { name, type: 1, options },
  member: { user: { id: userId } },
});

async function send(type: number, name: string, userId: string, options: Opt[] = []) {
  const response = await interactionsRoute(signed(interaction(type, name, userId, options)));
  expect(response.status).toBe(200);
  return (await response.json()) as { type: number; data: Record<string, any> };
}

const FREE = '100000000000000011';
const PRO = '100000000000000012';
const UNLINKED = '100000000000000013';

beforeAll(() => {
  Object.assign(process.env, {
    DISCORD_PUBLIC_KEY: PUBLIC_HEX,
    DISCORD_APPLICATION_ID: APP,
    DISCORD_BOT_TOKEN: 'jeton-factice',
    DISCORD_GUILD_ID: '222222222222222222',
    DISCORD_LEADERBOARD_CHANNEL_ID: '666666666666666666',
    NEXT_PUBLIC_SITE_URL: 'https://tracktout.com',
  });
  setDiscordFetchForTests(fakeDiscord as typeof fetch);
});

afterAll(() => {
  setDiscordFetchForTests(null);
  setRepoForTests(null);
  for (const k of ['DISCORD_PUBLIC_KEY', 'DISCORD_APPLICATION_ID', 'DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_LEADERBOARD_CHANNEL_ID', 'NEXT_PUBLIC_SITE_URL']) {
    delete process.env[k];
  }
});

beforeEach(async () => {
  calls = [];
  repo = new LocalRepo(null);
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: DAY });
  for (const [id, plan, discord] of [
    ['gratuit', 'free', FREE],
    ['pro', 'pro', PRO],
  ] as const) {
    await repo.ensureProfile({ id, email: `${id}@test.fr` });
    await repo.updateProfile(id, { plan, niches: ['beaute'], onboarded_at: '2026-11-01T00:00:00Z', discord_user_id: discord });
  }
});

afterEach(() => {
  setStructuredRunnerForTests(null);
  setFollowupFetchForTests(null);
  vi.unstubAllEnvs();
});

describe('compte lié et plan', () => {
  it('sans compte lié, chaque commande explique comment lier, sans rien montrer', async () => {
    for (const name of ['produits', 'score', 'script', 'alerte', 'classement']) {
      const res = await send(2, name, UNLINKED, [{ name: 'niche', type: 3, value: 'beaute' }]);
      expect(res.type).toBe(4);
      expect(res.data.flags).toBe(64);
      expect(res.data.content).toContain('/lier');
    }
    const auto = await send(4, 'score', UNLINKED, [{ name: 'produit', type: 3, value: 'a', focused: true }]);
    expect(auto).toEqual({ type: 8, data: { choices: [] } });
  });
});

describe('/produits', () => {
  it('Pro : le top du jour de la niche avec les scores ; Gratuit : seulement ses produits du jour, sans score', async () => {
    const all = (await repo.listProducts()).filter((p) => p.niche === 'beaute');
    const pro = await send(2, 'produits', PRO, [{ name: 'niche', type: 3, value: 'beaute' }]);
    const proText = String(pro.data.embeds[0].description);
    expect(pro.data.flags).toBe(64);
    expect(proText).toContain('/100');
    expect(proText).toContain(all.sort((a, b) => b.latest_score - a.latest_score)[0].name);

    const free = await send(2, 'produits', FREE, [{ name: 'niche', type: 3, value: 'beaute' }]);
    const freeText = String(free.data.embeds[0].description);
    expect(freeText).not.toContain('/100');
    const visible = rankForUser(await repo.listProducts(), ['beaute']).slice(0, 3);
    for (const p of visible) expect(freeText).toContain(p.name);
    const hidden = rankForUser(await repo.listProducts(), ['beaute']).slice(3);
    for (const p of hidden) expect(freeText).not.toContain(p.name);
    expect(freeText).toContain('réservés au plan Pro');

    const elsewhere = await send(2, 'produits', FREE, [{ name: 'niche', type: 3, value: 'tech' }]);
    expect(elsewhere.data.content).toContain('aucun n’est en Tech et accessoires');
  });
});

describe('/score et autocomplétion', () => {
  it('l’autocomplétion ne propose jamais à un compte gratuit un produit qu’il ne peut pas ouvrir', async () => {
    const free = await send(4, 'score', FREE, [{ name: 'produit', type: 3, value: '', focused: true }]);
    expect(free.type).toBe(8);
    const visibleIds = rankForUser(await repo.listProducts(), ['beaute']).slice(0, 3).map((p) => p.id);
    expect(free.data.choices.map((c: { value: string }) => c.value).sort()).toEqual([...visibleIds].sort());
    const pro = await send(4, 'score', PRO, [{ name: 'produit', type: 3, value: '', focused: true }]);
    expect(pro.data.choices).toHaveLength(25);
    for (const c of pro.data.choices as Array<{ name: string; value: string }>) {
      expect(c.name.length).toBeLessThanOrEqual(100);
      expect(c.value.length).toBeLessThanOrEqual(100);
    }
  });

  it('répond tout de suite (sans IA), masque le score en Gratuit et applique le quota quotidien côté serveur', async () => {
    setStructuredRunnerForTests(async () => {
      throw new Error('/score ne doit jamais appeler l’IA');
    });
    const [first] = rankForUser(await repo.listProducts(), ['beaute']);
    const pro = await send(2, 'score', PRO, [{ name: 'produit', type: 3, value: first.id }]);
    expect(pro.type).toBe(4);
    expect(pro.data.embeds[0].fields[0]).toMatchObject({ name: 'Score', value: `**${first.latest_score}/100**` });
    expect(pro.data.embeds[0].fields.at(-1).name).toBe('Pourquoi');

    for (let i = 0; i < 3; i++) {
      const res = await send(2, 'score', FREE, [{ name: 'produit', type: 3, value: first.name.slice(0, 12) }]);
      expect(res.data.embeds[0].title).toBe(first.name);
      expect(res.data.embeds[0].fields[0].value).toContain('Masqué');
    }
    const blocked = await send(2, 'score', FREE, [{ name: 'produit', type: 3, value: first.id }]);
    expect(blocked.data.content).toContain('Tu as utilisé tes 3 commandes');
    expect(await repo.countRecordsSince('gratuit', COMMAND_KIND, '2000-01-01')).toBe(3);
  });

  it('un compte gratuit ne peut pas viser un produit verrouillé, même avec son identifiant', async () => {
    const locked = rankForUser(await repo.listProducts(), ['beaute'])[5];
    const res = await send(2, 'score', FREE, [{ name: 'produit', type: 3, value: locked.id }]);
    expect(res.data.content).toContain('n’est pas dans tes produits du jour');
    expect(await repo.countRecordsSince('gratuit', COMMAND_KIND, '2000-01-01')).toBe(0);
  });
});

describe('/script (réponse différée)', () => {
  it('répond « réfléchit… » (type 5, éphémère), puis modifie la réponse par le webhook de l’interaction', async () => {
    setStructuredRunnerForTests(async () => ({ accroche: 'Regarde ce que ce sérum fait en dix secondes.', idee: 'Montre-le en main, puis la texture.' }) as never);
    const [first] = rankForUser(await repo.listProducts(), ['beaute']);
    const res = await send(2, 'script', PRO, [{ name: 'produit', type: 3, value: first.id }]);
    expect(res).toEqual({ type: 5, data: { flags: 64 } });
    await waitForDiscordFollowups();
    const edit = calls.find((c) => c.method === 'PATCH')!;
    expect(edit.path).toBe(`/webhooks/${APP}/jeton-interaction-de-test_123/messages/@original`);
    expect(edit.auth).toBeNull();
    const embed = (edit.body!.embeds as Array<{ description: string }>)[0];
    expect(embed.description).toContain('« Regarde ce que ce sérum fait en dix secondes. »');
    const [record] = await repo.listRecords<{ status: string; ia: boolean }>('pro', COMMAND_KIND);
    expect(record.data).toMatchObject({ status: 'ok', ia: true });
  });

  it('une accroche qui enfreint le garde-fou est réécrite, puis remplacée par une accroche sûre', async () => {
    setStructuredRunnerForTests(async () => ({ accroche: 'Le meilleur sérum, résultat garanti à vie !', idee: 'Gagne 500 € par mois avec ce produit.' }) as never);
    const [first] = rankForUser(await repo.listProducts(), ['beaute']);
    await send(2, 'script', PRO, [{ name: 'produit', type: 3, value: first.id }]);
    await waitForDiscordFollowups();
    const text = JSON.stringify(calls.find((c) => c.method === 'PATCH')!.body);
    expect(text).not.toMatch(/meilleur|garanti|500 €/);
  });

  it('en échec, la réponse le dit et la commande ne compte pas', async () => {
    setStructuredRunnerForTests(async () => {
      throw new Error('panne');
    });
    const [first] = rankForUser(await repo.listProducts(), ['beaute']);
    await send(2, 'script', PRO, [{ name: 'produit', type: 3, value: first.id }]);
    await waitForDiscordFollowups();
    expect(String(calls.find((c) => c.method === 'PATCH')!.body!.content)).toContain('ne compte pas');
    expect(await repo.countRecordsSince('pro', COMMAND_KIND, '2000-01-01')).toBe(0);
  });

  it('sur Netlify, le travail part dans la fonction d’arrière-plan, protégée par CRON_SECRET', async () => {
    vi.stubEnv('SITE_ID', 'site');
    vi.stubEnv('URL', 'https://tracktout.netlify.app');
    vi.stubEnv('CRON_SECRET', 'secret-cron');
    const queued: Array<{ url: string; auth: string | null; body: unknown }> = [];
    let status = 202;
    setFollowupFetchForTests((async (url: string, init?: RequestInit) => {
      queued.push({ url: String(url), auth: new Headers(init?.headers).get('authorization'), body: JSON.parse(String(init?.body)) });
      return new Response(null, { status });
    }) as typeof fetch);
    const [first] = rankForUser(await repo.listProducts(), ['beaute']);
    expect((await send(2, 'script', PRO, [{ name: 'produit', type: 3, value: first.id }])).type).toBe(5);
    expect(queued[0]).toMatchObject({ url: 'https://tracktout.netlify.app/.netlify/functions/discord-interaction-background', auth: 'Bearer secret-cron' });
    expect(isFollowupJob(queued[0].body)).toBe(true);

    status = 500;
    const refused = await send(2, 'script', PRO, [{ name: 'produit', type: 3, value: first.id }]);
    expect(refused.data.content).toContain('ne compte pas');
    expect(await repo.countRecordsSince('pro', COMMAND_KIND, '2000-01-01')).toBe(1);

    // La fonction d'arrière-plan ne fait rien sans le secret, ni avec une demande mal formée.
    calls = [];
    await handler(new Request('https://x/.netlify/functions/discord-interaction-background', { method: 'POST', body: JSON.stringify(queued[0].body) }));
    await handler(new Request('https://x', { method: 'POST', headers: { authorization: 'Bearer secret-cron' }, body: '{"kind":"script"}' }));
    expect(calls).toEqual([]);
    setStructuredRunnerForTests(async () => ({ accroche: 'Voilà ce que personne ne te montre.', idee: 'Le produit en main, puis la démonstration.' }) as never);
    await handler(
      new Request('https://x', { method: 'POST', headers: { authorization: 'Bearer secret-cron' }, body: JSON.stringify(queued[0].body) }),
    );
    expect(calls.map((c) => c.method)).toEqual(['PATCH']);
  });
});

describe('/alerte (fiche `alerte`)', () => {
  it('fermée en Gratuit ; en Pro, 3 alertes actives au plus, au format commun', async () => {
    const free = await send(2, 'alerte', FREE, [
      { name: 'niche', type: 3, value: 'beaute' },
      { name: 'commission', type: 10, value: 15 },
    ]);
    expect(free.data.content).toContain('plan Pro');
    for (let i = 0; i < 3; i++) {
      const ok = await send(2, 'alerte', PRO, [
        { name: 'niche', type: 3, value: i === 0 ? 'toutes' : 'beaute' },
        { name: 'commission', type: 10, value: 12.5 },
        { name: 'ventes_7j', type: 4, value: 50 },
        { name: 'croissance', type: 4, value: 20 },
      ]);
      expect(ok.data.content).toContain('✅ Alerte créée');
    }
    const records = await repo.listRecords<AlerteData>('pro', ALERT_KIND);
    expect(records.map((r) => r.data)).toContainEqual({ niche: null, minCommissionPercent: 12.5, minSales7d: 50, minGrowth: 0.2, active: true });
    expect(records.every((r) => parseAlerte(r.data))).toBe(true);
    const fourth = await send(2, 'alerte', PRO, [
      { name: 'niche', type: 3, value: 'beaute' },
      { name: 'commission', type: 10, value: 10 },
    ]);
    expect(fourth.data.content).toContain('déjà 3 alertes actives');
  });

  it('valide le format et dit si un produit remplit l’alerte', () => {
    expect(parseAlerte({ niche: 'inconnue', minCommissionPercent: 10 })).toBeNull();
    expect(parseAlerte({ niche: 'beaute', minCommissionPercent: -1 })).toBeNull();
    expect(parseAlerte({ niche: null, minCommissionPercent: 10 })).toEqual({ niche: null, minCommissionPercent: 10, minSales7d: null, minGrowth: null, active: true });
    const product = {
      niche: 'beaute',
      commission_rate: 0.15,
      growth_7d: 0.3,
      sales_30d: [10, 10, 10, 10, 10, 10, 10, 10],
      latest_breakdown: { growth_7d: 0.3, daily_sales_7d: 10 },
    } as unknown as Product;
    expect(sales7d(product)).toBe(70);
    const base: AlerteData = { niche: 'beaute', minCommissionPercent: 15, minSales7d: 70, minGrowth: 0.3, active: true };
    expect(matchesAlerte(product, base)).toBe(true);
    expect(matchesAlerte(product, { ...base, minCommissionPercent: 16 })).toBe(false);
    expect(matchesAlerte(product, { ...base, minSales7d: 71 })).toBe(false);
    expect(matchesAlerte(product, { ...base, niche: 'tech' })).toBe(false);
    expect(matchesAlerte(product, { ...base, active: false })).toBe(false);
    const unmeasured = { ...product, latest_breakdown: { growth_7d: null, daily_sales_7d: null } } as unknown as Product;
    expect(matchesAlerte(unmeasured, base)).toBe(false);
  });
});

describe('/classement et classement hebdomadaire', () => {
  it('compte les jours d’affilée jusqu’à aujourd’hui, ou hier si rien n’est encore fait', () => {
    expect(streakDays(new Set(['2026-11-10', '2026-11-11', '2026-11-12']), '2026-11-12')).toBe(3);
    expect(streakDays(new Set(['2026-11-10', '2026-11-11']), '2026-11-12')).toBe(2);
    expect(streakDays(new Set(['2026-11-09']), '2026-11-12')).toBe(0);
  });

  it('ne publie que les membres inscrits, le lundi, une fois, sans notifier personne', async () => {
    const monday = new Date('2026-11-16T10:00:00Z'); // 11 h à Paris
    expect(await send(2, 'classement', PRO, [{ name: 'choix', type: 3, value: 'rejoindre' }])).toMatchObject({ type: 4 });
    expect((await repo.listRecords<{ classement: boolean }>('pro', SETTINGS_KIND))[0].data).toEqual({ classement: true });
    setStreakSource(async (userId) => (userId === 'pro' ? 4 : 9));
    try {
      expect(await leaderboardEntries(repo, monday)).toEqual([{ userId: 'pro', discordUserId: PRO, days: 4 }]);
      expect(await postWeeklyLeaderboard(repo, new Date('2026-11-17T10:00:00Z'))).toBe('pas-encore');
      expect(await postWeeklyLeaderboard(repo, monday)).toBe('publie');
      const post = calls.find((c) => c.path === '/channels/666666666666666666/messages')!;
      expect(post.body!.allowed_mentions).toEqual({ parse: [] });
      const text = String((post.body!.embeds as Array<{ description: string }>)[0].description);
      expect(text).toContain(`<@${PRO}> · 4 jours d’affilée`);
      expect(text).not.toContain(FREE);
      expect(await postWeeklyLeaderboard(repo, new Date('2026-11-16T15:00:00Z'))).toBe('deja');

      await send(2, 'classement', PRO, [{ name: 'choix', type: 3, value: 'quitter' }]);
      expect(await leaderboardEntries(repo, monday)).toEqual([]);
    } finally {
      setStreakSource(null);
    }
  });

  it('/classement voir donne la série par défaut (scripts écrits, commandes, vidéos postées)', async () => {
    await repo.insertScript({ user_id: 'pro', product_id: 'x', format: 'demo', hooks: [], script: [], full_text: '', source: 'simulation', saved: false, regen_count: 0 });
    const res = await send(2, 'classement', PRO, [{ name: 'choix', type: 3, value: 'voir' }]);
    expect(res.data.content).toMatch(/Ta série : 1 jour d’affilée|Pas de série en cours/);
  });
});

describe('recherche', () => {
  it('trouve un produit par le début du nom, sans accents ni majuscules', () => {
    const products = [
      { id: 'a', name: 'Sérum éclat Vitamine C', latest_score: 50 },
      { id: 'b', name: 'Crème hydratante', latest_score: 80 },
    ] as Product[];
    expect(searchProducts(products, 'serum').map((p) => p.id)).toEqual(['a']);
    expect(searchProducts(products, 'VITAMINE c').map((p) => p.id)).toEqual(['a']);
    expect(searchProducts(products, '').map((p) => p.id)).toEqual(['b', 'a']);
  });
});
