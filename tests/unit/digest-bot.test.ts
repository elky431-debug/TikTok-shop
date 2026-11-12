import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as linkRoute } from '@/app/api/bot/link/route';
import { GET as membersRoute } from '@/app/api/bot/members/route';
import { GET as dailyRoute } from '@/app/api/bot/daily/route';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { scheduleDigestEmails } from '@/lib/digest/deliver';
import { prepareDigests } from '@/lib/digest/prepare';
import { createDiscordLinkCode } from '@/lib/discord';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { parisOffsetMinutes, parisTimeToUtc } from '@/lib/utils';

const repo = new LocalRepo(null);
const DAY = '2026-11-12';

beforeAll(async () => {
  setRepoForTests(repo);
  process.env.BOT_API_SECRET = 'secret-bot';
  await refreshCatalog({ repo, provider: new MockProvider(), date: DAY });
});
afterAll(() => {
  setRepoForTests(null);
  process.env.BOT_API_SECRET = '';
});

describe('heure de Paris', () => {
  it('gère l’heure d’hiver et l’heure d’été', () => {
    expect(parisOffsetMinutes(new Date('2026-01-15T12:00:00Z'))).toBe(60);
    expect(parisOffsetMinutes(new Date('2026-07-15T12:00:00Z'))).toBe(120);
    expect(parisTimeToUtc('2026-11-12', 8).toISOString()).toBe('2026-11-12T07:00:00.000Z');
    expect(parisTimeToUtc('2026-06-12', 8).toISOString()).toBe('2026-06-12T06:00:00.000Z');
  });
});

describe('récap du matin par e-mail', () => {
  it('programme l’e-mail à l’heure choisie, ignore ceux qui l’ont désactivé', async () => {
    for (const [id, hour, email] of [
      ['matin', 9, true],
      ['sans-mail', 8, false],
    ] as const) {
      await repo.ensureProfile({ id, email: `${id}@test.fr` });
      await repo.updateProfile(id, { niches: ['maison'], onboarded_at: new Date().toISOString(), digest_hour: hour, digest_email: email });
    }
    await prepareDigests(DAY, repo);
    const stats = await scheduleDigestEmails(DAY, repo, new Date('2026-11-12T03:00:00Z'));
    expect(stats.scheduled).toBe(1);
    expect((await repo.getDigest('matin', DAY))?.email_status).toBe('scheduled');
    expect((await repo.getDigest('sans-mail', DAY))?.email_status).toBe('skipped');
    const [mail] = await repo.listLocalEmails!(5);
    expect(mail.to).toBe('matin@test.fr');
    expect(mail.scheduled_at).toBe('2026-11-12T08:00:00.000Z');
    expect(mail.html).toContain('Ouvrir mon radar');
    // Rejouer la tâche n'envoie pas deux fois.
    expect((await scheduleDigestEmails(DAY, repo, new Date('2026-11-12T03:00:00Z'))).scheduled).toBe(0);
  });
});

describe('API du bot Discord', () => {
  const call = (body: unknown, secret = 'secret-bot') =>
    linkRoute(
      new Request('http://x/api/bot/link', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  it('refuse sans le bon secret', async () => {
    expect((await call({ code: 'X', discord_user_id: '123456' }, 'mauvais')).status).toBe(401);
  });

  it('lie un compte avec un code à usage unique', async () => {
    await repo.ensureProfile({ id: 'dis', email: 'dis@test.fr' });
    await repo.updateProfile('dis', { plan: 'pro', first_name: 'Inès' });
    const { code } = await createDiscordLinkCode('dis');
    const ok = await call({ code: code.toLowerCase(), discord_user_id: '987654321098765432' });
    expect(await ok.json()).toMatchObject({ ok: true, first_name: 'Inès', pro: true });
    expect((await repo.getProfile('dis'))?.discord_user_id).toBe('987654321098765432');
    expect((await repo.getProfile('dis'))?.digest_discord).toBe(true);
    const again = await call({ code, discord_user_id: '987654321098765432' });
    expect(again.status).toBe(404);

    const members = await (await membersRoute(new Request('http://x', { headers: { authorization: 'Bearer secret-bot' } }))).json();
    expect(members.members).toEqual([{ discord_user_id: '987654321098765432', plan: 'pro', pro: true }]);
  });

  it('ne révèle aucun nom de produit dans le salon public', async () => {
    const data = await (await dailyRoute(new Request('http://x', { headers: { authorization: 'Bearer secret-bot' } }))).json();
    expect(data.teaser).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(data.teaser[i].masked_name).toContain('█');
      expect(data.teaser[i].masked_name).not.toBe(data.full[i].name);
      expect(JSON.stringify(data.teaser[i])).not.toContain('url');
    }
  });
});
