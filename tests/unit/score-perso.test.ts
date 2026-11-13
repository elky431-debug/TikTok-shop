import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { Profile } from '@/lib/db/types';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { getRadar, toProductView } from '@/lib/radar';
import {
  computeScores,
  DEFAULT_WEIGHTS,
  isDefaultWeights,
  OUTSIDE_NICHES_MALUS,
  personalPoints,
  personalReasons,
  pointsWith,
  sanitizeWeights,
  STYLE_BONUS,
  WEIGHT_PRESETS,
  weightShares,
} from '@/lib/radar/personal';
import { effectiveWeights, getRadarSettings, saveRadarSettings } from '@/lib/radar/settings';
import { SCALE } from '@/lib/score';
import { breakdown, NOW, product, TODAY } from './radar-helpers';

type P = Pick<Profile, 'follower_range' | 'video_style' | 'niches'>;
const profile = (over: Partial<P> = {}): P => ({ follower_range: '1500-5000', video_style: null, niches: ['beaute'], ...over });

// A : peu de concurrence, petite commission. B : beaucoup de concurrence, grosse commission.
const a = product('a', { latest_breakdown: breakdown({ croissance: 0.5, commission: 0.4, saturation: 1, prix: 1 }) });
const b = product('b', { latest_breakdown: breakdown({ croissance: 0.5, commission: 1, saturation: 0.2, prix: 1 }) });

describe('bloc 2.1 · score pour toi', () => {
  it('petit compte : la concurrence compte plus ; gros compte : la commission compte plus', () => {
    const small = computeScores([a, b], profile({ follower_range: '0-500' }), null);
    expect(small.get('a')!.personal).toBeGreaterThan(small.get('b')!.personal);
    const big = computeScores([a, b], profile({ follower_range: '20000+' }), null);
    expect(big.get('b')!.personal).toBeGreaterThan(big.get('a')!.personal);
    // Le score général ne bouge pas : c'est celui du jour.
    expect(small.get('a')!.score).toBe(a.latest_score);
  });

  it('style qui colle à la niche : +5 points ; hors de ses niches : −10 points', () => {
    const base = personalPoints(a, profile(), DEFAULT_WEIGHTS)!;
    expect(personalPoints(a, profile({ video_style: 'avant_apres' }), DEFAULT_WEIGHTS)).toBeCloseTo(base + STYLE_BONUS);
    expect(personalPoints(a, profile({ niches: ['tech'] }), DEFAULT_WEIGHTS)).toBeCloseTo(base - OUTSIDE_NICHES_MALUS);
  });

  it('toujours expliqué en phrases', () => {
    const reasons = personalReasons(a, profile({ follower_range: '500-1500', video_style: 'face_camera' }), null);
    expect(reasons[0]).toMatch(/^Ton compte \(entre 500 et 1 500 abonnés\) : concurrence \+40 %, prix \+20 %, commission −10 % sur le poids\./);
    expect(reasons[1]).toBe('Ton style « Face caméra » se prête bien aux produits beauté : +5 points.');
    expect(personalReasons(a, profile({ follower_range: null }), null)[0]).toContain('tranche d’abonnés');
  });
});

describe('bloc 2.2 · évolution du score sur 30 jours', () => {
  const repo = new LocalRepo(null);
  beforeAll(async () => {
    setRepoForTests(repo);
    await refreshCatalog({ repo, provider: new MockProvider(), date: TODAY, backfillDays: 30 });
  });
  afterAll(() => setRepoForTests(null));

  it('un score par jour, sur l’échelle de 15 à 90 (instantanés quotidiens)', async () => {
    const [first] = await repo.listProducts({ niches: ['beaute'] });
    const history = await repo.getProductSnapshots(first.id, 30);
    expect(history).toHaveLength(30);
    expect(history.at(-1)!.date).toBe(TODAY);
    for (const s of history) {
      expect(s.score).toBeGreaterThanOrEqual(SCALE.min);
      expect(s.score).toBeLessThanOrEqual(SCALE.max);
    }
  });
});

describe('bloc 2.3 · poids réglables (Pro+)', () => {
  it('nettoie les poids, reconnaît le réglage par défaut', () => {
    expect(sanitizeWeights({ croissance: '50', commission: 30, saturation: '200', prix: -4 })).toEqual({ croissance: 50, commission: 30, saturation: 100, prix: 0 });
    expect(sanitizeWeights({ croissance: 0, commission: 0, saturation: 0, prix: 0 })).toBeNull();
    expect(sanitizeWeights({ croissance: 'abc', commission: 1, saturation: 1, prix: 1 })).toBeNull();
    expect(isDefaultWeights({ croissance: 70, commission: 50, saturation: 40, prix: 20 })).toBe(true);
    expect(isDefaultWeights(WEIGHT_PRESETS.commission.weights)).toBe(false);
    expect(weightShares(DEFAULT_WEIGHTS)).toEqual({ croissance: 38.9, commission: 27.8, saturation: 22.2, prix: 11.1 });
  });

  it('plus de poids à la commission fait passer devant le produit le mieux payé', () => {
    expect(pointsWith(a.latest_breakdown, DEFAULT_WEIGHTS)).toBeGreaterThan(pointsWith(b.latest_breakdown, DEFAULT_WEIGHTS)!);
    const scores = computeScores([a, b], profile(), WEIGHT_PRESETS.commission.weights);
    expect(scores.get('b')!.score).toBeGreaterThan(scores.get('a')!.score);
    // Un critère non fourni reste ignoré, poids réparti.
    const partial = breakdown({ croissance: null, commission: 1, saturation: 1, prix: 1 });
    expect(pointsWith(partial, { croissance: 100, commission: 10, saturation: 10, prix: 10 })).toBe(100);
  });

  it('seul Pro+ applique ses poids (côté serveur), et peut revenir au réglage par défaut', async () => {
    const repo = new LocalRepo(null);
    setRepoForTests(repo);
    await repo.upsertProducts([a, b].map((p) => ({ ...p, updated_at: NOW })));
    await repo.ensureProfile({ id: 'w', email: 'w@exemple.fr' });
    let user = await repo.updateProfile('w', { plan: 'proplus', niches: ['beaute'], onboarded_at: NOW, follower_range: '1500-5000' });
    await saveRadarSettings('w', { poids: WEIGHT_PRESETS.commission.weights }, repo);
    const settings = await getRadarSettings('w', repo);
    expect(effectiveWeights(user, settings)).toEqual(WEIGHT_PRESETS.commission.weights);
    expect(effectiveWeights({ plan: 'pro' }, settings)).toBeNull();
    const radar = await getRadar(user, {});
    const first = radar.items[0];
    expect(first.kind === 'visible' && first.product.id).toBe('b');
    await saveRadarSettings('w', { poids: null }, repo);
    user = (await repo.getProfile('w'))!;
    expect((await getRadarSettings('w', repo)).poids).toBeNull();
    const back = await getRadar(user, {});
    expect(back.weights).toBeNull();
    setRepoForTests(null);
  });
});

describe('bloc 2.4 · l’explication reste visible', () => {
  it('en Gratuit, les phrases restent, seuls les points et le score sont retirés', () => {
    const view = toProductView(a, 'free');
    expect(view.score).toBeNull();
    expect(view.personal_score).toBeNull();
    expect(view.breakdown?.summary).toBe('Résumé.');
    expect(view.breakdown?.parts.every((p) => p.sentence.length > 0 && p.points === null)).toBe(true);
  });
});
