import { describe, expect, it } from 'vitest';
import { dailySeries, mondayOf, monthSpans, nextVideos, variation } from '@/lib/dashboard';
import { cleanHandle, mapTiktokProfile, refreshCreatorProfile } from '@/lib/creator-profile';
import type { PublicationPlan } from '@/lib/v2/planning';

describe('variation entre deux périodes', () => {
  it('en pourcentage quand la période précédente existe, en valeur sinon', () => {
    expect(variation(130, 100, 'vs hier')).toMatchObject({ direction: 'up', label: '+30 %' });
    expect(variation(50, 100, 'vs hier')).toMatchObject({ direction: 'down', label: '−50 %' });
    expect(variation(3, 0, 'vs hier')).toMatchObject({ direction: 'up', label: '+3' });
    expect(variation(0, 0, 'vs hier')).toMatchObject({ direction: 'flat', label: '=' });
  });
});

describe('périodes', () => {
  it('compare le mois en cours au mois dernier à la même date, bornée à sa fin', () => {
    expect(monthSpans('2026-11-13')).toEqual({ current: ['2026-11-01', '2026-11-13'], previous: ['2026-10-01', '2026-10-13'] });
    expect(monthSpans('2026-03-31').previous).toEqual(['2026-02-01', '2026-02-28']);
  });
  it('trouve le lundi de la semaine', () => {
    expect(mondayOf('2026-11-13')).toBe('2026-11-09');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
  });
});

describe('courbe des gains', () => {
  it('additionne gains et ventes par jour, jours vides à zéro', () => {
    const series = dailySeries(
      [
        { date: '2026-11-13', product_name: 'A', product_id: null, video: null, amount_cents: 500, sales: 2, source: 'saisie' },
        { date: '2026-11-13', product_name: 'B', product_id: null, video: null, amount_cents: 250, sales: null, source: 'saisie' },
        { date: '2026-01-01', product_name: 'C', product_id: null, video: null, amount_cents: 999, sales: 9, source: 'saisie' },
      ],
      '2026-11-13',
      7,
    );
    expect(series).toHaveLength(7);
    expect(series[0].date).toBe('2026-11-07');
    expect(series[6]).toEqual({ date: '2026-11-13', gains_cents: 750, sales: 2 });
    expect(series[3]).toEqual({ date: '2026-11-10', gains_cents: 0, sales: 0 });
  });
});

describe('vidéos à tourner cette semaine', () => {
  const plan = (id: string, items: PublicationPlan['items']): PublicationPlan => ({ product_id: id, product_name: id, rhythm: 3, start: '2026-11-02', items });
  it('en retard d’abord, puis par date, rien après dimanche, une seule vidéo sans date par produit', () => {
    const boards = [
      plan('a', [
        { n: 1, date: '2026-11-04', status: 'poste', url: null },
        { n: 2, date: '2026-11-11', status: 'a_tourner', url: null },
        { n: 3, date: '2026-11-14', status: 'a_tourner', url: null },
        { n: 4, date: '2026-11-18', status: 'a_tourner', url: null },
      ]),
      plan('b', [
        { n: 1, date: null, status: 'a_tourner', url: null },
        { n: 2, date: null, status: 'a_tourner', url: null },
      ]),
    ];
    const next = nextVideos(boards, '2026-11-13');
    expect(next.map((v) => `${v.productId}${v.n}`)).toEqual(['a2', 'a3', 'b1']);
    expect(next[0].overdue).toBe(true);
    expect(next[1].overdue).toBe(false);
  });
});

describe('profil TikTok (Nexscope)', () => {
  const response = {
    code: 0,
    data: {
      resourceStatus: 'AVAILABLE',
      data: { stats: { followerCount: 4100, heartCount: 190400, videoCount: 87 }, user: { uniqueId: 'lea.teste', nickname: 'Léa' } },
    },
  };
  it('nettoie le pseudo', () => {
    expect(cleanHandle(' @lea.teste ')).toBe('lea.teste');
    expect(cleanHandle('lea teste')).toBeNull();
    expect(cleanHandle('')).toBeNull();
  });
  it('lit les chiffres documentés, sans rien inventer', () => {
    expect(mapTiktokProfile(response, 'lea.teste')).toEqual({ handle: 'lea.teste', nickname: 'Léa', followers: 4100, likes: 190400, videos: 87, status: 'AVAILABLE' });
    expect(mapTiktokProfile({ code: 0, data: { data: { stats: { followerCount: 12 } } } }, 'x1')).toMatchObject({ followers: 12, likes: null, videos: null });
    expect(mapTiktokProfile({ code: 0, data: { resourceStatus: 'NOT_FOUND' } }, 'x1')).toBeNull();
  });
  it('un seul essai par jour, même en cas d’échec', async () => {
    const records = new Map<string, { id: string; data: unknown }>();
    const repo = {
      listRecords: async () => [...records.values()],
      saveRecord: async (_u: string, _k: string, data: unknown, id?: string) => {
        const record = { id: id ?? 'r1', data };
        records.set(record.id, record);
        return record;
      },
    } as never;
    process.env.NEXSCOPE_API_KEY = 'cle-de-test';
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return response;
    };
    const now = new Date('2026-11-13T10:00:00Z');
    const first = await refreshCreatorProfile(repo, 'u1', '@lea.teste', { now, fetcher });
    expect(first).toMatchObject({ followers: 4100, error: null, attempted_on: '2026-11-13' });
    await refreshCreatorProfile(repo, 'u1', '@lea.teste', { now, fetcher });
    expect(calls).toBe(1);
    await refreshCreatorProfile(repo, 'u1', '@lea.teste', { now: new Date('2026-11-14T10:00:00Z'), fetcher: async () => { calls++; throw new Error('panne'); } });
    expect(calls).toBe(2);
    const kept = [...records.values()][0].data as { followers: number; error: string };
    expect(kept.followers).toBe(4100);
    expect(kept.error).toMatch(/Nouvel essai demain/);
    delete process.env.NEXSCOPE_API_KEY;
  });
});
