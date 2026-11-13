import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiCostUsd, aiPrice, estimateMargin, nexscopeByDay, nexscopeRunCost } from '@/lib/admin/costs';
import {
  computeDailyMetrics,
  computeMrr,
  getBusinessMetrics,
  latestSubscriptions,
  listDailyMetrics,
  recordDailyMetrics,
} from '@/lib/admin/metrics';
import { filterProfiles, listBeneficiaries } from '@/lib/admin/people';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { CronRun, Subscription } from '@/lib/db/types';
import { recordPayout } from '@/lib/referral';

let repo: LocalRepo;
beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => setRepoForTests(null));

const sub = (over: Partial<Subscription>): Subscription => ({
  id: `sub_${Math.random().toString(36).slice(2)}`,
  user_id: 'u',
  provider: 'stripe',
  customer_id: null,
  status: 'active',
  plan: 'pro',
  billing_interval: 'month',
  price_id: null,
  current_period_end: null,
  trial_end: null,
  cancel_at_period_end: false,
  updated_at: '2026-11-10T10:00:00Z',
  ...over,
});

describe('MRR', () => {
  it('abonnements payants × prix du plan, annuel ÷ 12, essais à part ; Stripe seulement quand il existe', () => {
    const all = [
      sub({ user_id: 'a', plan: 'pro', billing_interval: 'month' }), // 19,90
      sub({ user_id: 'b', plan: 'proplus', billing_interval: 'year' }), // 335 / 12 = 27,92
      sub({ user_id: 'c', plan: 'pro', status: 'past_due' }), // 19,90 (Stripe réessaie)
      sub({ user_id: 'd', plan: 'pro', status: 'trialing' }),
      sub({ user_id: 'e', plan: 'pro', status: 'canceled' }),
      sub({ user_id: 'a', plan: 'pro', status: 'canceled', updated_at: '2026-01-01T00:00:00Z' }), // ancien abonnement de a
      sub({ user_id: 'z', provider: 'simulation', plan: 'proplus' }),
    ];
    const { subscriptions, source } = latestSubscriptions(all);
    expect(source).toBe('stripe');
    expect(subscriptions.map((s) => s.user_id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    const mrr = computeMrr(subscriptions, 0.2);
    expect(mrr.ttcCents).toBe(1990 + 2792 + 1990);
    expect(mrr.htCents).toBe(Math.round((1990 + 2792 + 1990) / 1.2));
    expect(mrr).toMatchObject({ paying: 3, trialing: 1 });
    expect(mrr.byPlan.proplus).toEqual({ month: 0, year: 1, cents: 2792 });
  });
});

describe('indicateurs', () => {
  it('inscriptions, conversion gratuit → payant, résiliations, actifs', async () => {
    const now = new Date();
    for (const [id, onboarded, seen] of [
      ['a', true, now.toISOString()],
      ['b', true, new Date(now.getTime() - 4 * 86_400_000).toISOString()],
      ['c', true, null],
      ['d', false, null],
    ] as const) {
      await repo.ensureProfile({ id, email: `${id}@test.fr` });
      await repo.updateProfile(id, { onboarded_at: onboarded ? '2026-11-01T00:00:00Z' : null, last_seen_at: seen });
    }
    await repo.upsertSubscription(sub({ id: 's1', user_id: 'a', updated_at: '2026-11-01T00:00:00Z' }));
    await repo.upsertSubscription(sub({ id: 's2', user_id: 'b', status: 'canceled', updated_at: new Date(now.getTime() - 5 * 86_400_000).toISOString() }));
    await repo.upsertSubscription(sub({ id: 's3', user_id: 'c', status: 'active', cancel_at_period_end: true, updated_at: '2026-11-01T00:00:00Z' }));
    const m = await getBusinessMetrics(repo, now);
    expect(m.accounts).toBe(4);
    expect(m.signups.last7).toBe(4);
    expect(m.signups.byDay).toHaveLength(14);
    expect(m.conversion).toMatchObject({ paying: 2, onboarded: 3 });
    expect(m.conversion.rate).toBeCloseTo(2 / 3);
    expect(m.churn).toMatchObject({ ended30: 1, scheduled: 1 });
    expect(m.churn.rate).toBeCloseTo(1 / 3);
    expect(m.active).toMatchObject({ today: 1, last7: 2 });
  });

  it('relève chaque nuit les actifs, les scripts et les appels d’IA de la veille, une seule fois', async () => {
    const now = new Date('2026-11-12T04:00:00Z');
    const day = '2026-11-11';
    for (const [id, seen] of [
      ['a', '2026-11-11T18:00:00Z'], // vu hier
      ['b', '2026-11-12T01:30:00Z'], // revenu cette nuit, mais a écrit 2 scripts hier
      ['c', '2026-11-05T10:00:00Z'], // pas venu
    ] as const) {
      await repo.ensureProfile({ id, email: `${id}@test.fr` });
      await repo.updateProfile(id, { last_seen_at: seen });
    }
    await repo.incrementUsage('b', day, -1);
    await repo.incrementUsage('b', day, -1);
    await repo.incrementUsage('a', '2026-11-12', -1);
    vi.useFakeTimers({ now: new Date('2026-11-11T12:00:00Z'), toFake: ['Date'] });
    await repo.saveRecord('a', 'offre', {});
    await repo.saveRecord('a', 'commande_discord', { ia: true });
    await repo.saveRecord('a', 'commande_discord', { ia: false });
    vi.useRealTimers();

    const metrics = await computeDailyMetrics(day, repo, now);
    expect(metrics).toMatchObject({ day, active: 2, scripts: 2, otherAi: 2 });
    const stored = await recordDailyMetrics(repo, now);
    expect(stored).toMatchObject({ day, active: 2 });
    await repo.updateProfile('c', { last_seen_at: '2026-11-11T20:00:00Z' });
    expect((await recordDailyMetrics(repo, now)).active).toBe(2);
    expect((await listDailyMetrics(7, repo, now)).map((d) => d.day)).toEqual([day]);
  });
});

describe('coûts', () => {
  const run = (details: Record<string, unknown>, started = '2026-11-12T03:05:00Z'): CronRun => ({
    id: Math.random().toString(36),
    job: 'refresh',
    trigger: 'cron',
    status: 'ok',
    details,
    started_at: started,
    finished_at: started,
  });

  it('crédits Nexscope depuis les compteurs de la tâche nocturne (recherche 22, vidéos 11, lot de détails 96)', () => {
    const r = run({ provider: 'nexscope', stats: { calls: 30, cacheHits: 4 }, videos: 8, details: 40 });
    expect(nexscopeRunCost(r)).toEqual({ calls: 30, discovery: 20, videos: 8, detailBatches: 2, credits: 20 * 22 + 8 * 11 + 2 * 96, cacheHits: 4 });
    expect(nexscopeRunCost(run({ provider: 'mock', stats: { calls: 0 } }))).toBeNull();
    const days = nexscopeByDay([r, run({ provider: 'nexscope', stats: { calls: 2 } }, '2026-11-12T10:00:00Z'), { ...r, job: 'autre' }], 0.5);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ day: '2026-11-12', calls: 32, credits: 20 * 22 + 8 * 11 + 2 * 96 + 2 * 22 });
    expect(days[0].eur).toBeCloseTo((days[0].credits * 0.5) / 1000);
    expect(nexscopeByDay([r], null)[0].eur).toBeNull();
  });

  it('coût de l’IA : jetons mesurés × prix du modèle ; inconnu si le prix manque, 0 sans IA', () => {
    expect(aiPrice()).toEqual({ model: 'simulé', input: 0, output: 0 });
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    expect(aiPrice()).toEqual({ model: 'gpt-6-luna', input: 0.1, output: 0.5 });
    // Script : 1 300 × 0,10 + 3 800 × 0,50 par million ≈ 0,002 $ (mesure de la décision 115).
    expect(aiCostUsd({ scripts: 1, otherAi: 0 })).toBeCloseTo(0.00203, 5);
    vi.stubEnv('OPENAI_MODEL', 'modele-inconnu');
    expect(aiPrice()).toBeNull();
    expect(aiCostUsd({ scripts: 10, otherAi: 0 })).toBeNull();
    vi.stubEnv('AI_PRICE_INPUT_PER_MTOK', '1');
    vi.stubEnv('AI_PRICE_OUTPUT_PER_MTOK', '2');
    expect(aiPrice()).toEqual({ model: 'modele-inconnu', input: 1, output: 2 });
  });

  it('marge par abonné payant : MRR HT − commissions − frais Stripe − coûts variables − fixes, avec ce qui manque', () => {
    const subs = [sub({ user_id: 'parraine', plan: 'pro' }), sub({ user_id: 'direct', plan: 'pro', billing_interval: 'year' })];
    const mrr = computeMrr(subs, 0.2);
    const margin = estimateMargin({
      mrr,
      subscriptions: subs,
      profiles: [
        { id: 'parraine', coach_id: null, referred_by: 'x' },
        { id: 'direct', coach_id: null, referred_by: null },
      ],
      coachRates: new Map(),
      nexscope30: [{ day: '2026-11-12', calls: 10, discovery: 10, videos: 0, detailBatches: 0, credits: 220, eur: null, cacheHits: 0 }],
      ai30: [{ scripts: 100, otherAi: 0 }],
    });
    expect(margin.commissionsCents).toBe(Math.round((1990 / 1.2) * 0.3));
    const yearlyFee = Math.round((16700 * 0.015 + 25) / 12);
    expect(margin.stripeFeesCents).toBe(Math.round(1990 * 0.015 + 25) + yearlyFee);
    expect(margin.nexscopeCents).toBeNull();
    expect(margin.aiCents).toBe(0);
    expect(margin.missing.join(' ')).toContain('NEXSCOPE_EUR_PER_1000_CREDITS');
    expect(margin.marginCents).toBe(mrr.htCents - margin.commissionsCents - margin.stripeFeesCents);
    expect(margin.perPayingCents).toBe(Math.round(margin.marginCents / 2));
  });
});

describe('utilisateurs, formateurs et versements', () => {
  it('cherche par e-mail, prénom ou code, filtre par plan', async () => {
    await repo.ensureProfile({ id: 'a', email: 'ines@test.fr' });
    await repo.ensureProfile({ id: 'b', email: 'bob@test.fr' });
    await repo.updateProfile('b', { plan: 'pro', first_name: 'Robert' });
    const all = await repo.listProfiles();
    expect(filterProfiles(all, 'INES').map((p) => p.id)).toEqual(['a']);
    expect(filterProfiles(all, 'rob').map((p) => p.id)).toEqual(['b']);
    expect(filterProfiles(all, '', 'pro').map((p) => p.id)).toEqual(['b']);
    expect(filterProfiles(all, all[0].referral_code.toLowerCase()).map((p) => p.id)).toEqual([all[0].id]);
  });

  it('liste les parrains et formateurs à payer ; un versement fait baisser le solde', async () => {
    await repo.ensureProfile({ id: 'coach', email: 'coach@test.fr' });
    await repo.ensureProfile({ id: 'parrain', email: 'parrain@test.fr' });
    await repo.ensureProfile({ id: 'filleul', email: 'filleul@test.fr' });
    await repo.updateProfile('filleul', { referred_by: 'parrain' });
    await repo.createCoach({ user_id: 'coach', training_name: 'Formation', promo_code: 'FORM30', commission_rate: 0.3 });
    const referral = (await repo.createReferral({ referrer_id: 'parrain', referred_id: 'filleul', coach_id: null }))!;
    await repo.addCommission({ referral_id: referral.id, referrer_id: 'parrain', invoice_id: 'in_1', amount_cents: 6000, month: '2026-11' });
    let list = await listBeneficiaries(repo);
    expect(list.map((b) => [b.userId, b.earnings.balanceCents, Boolean(b.coach)])).toEqual([
      ['parrain', 6000, false],
      ['coach', 0, true],
    ]);
    expect(list[0].earnings.next.eligible).toBe(true);
    await recordPayout('parrain', { amountCents: 6000, paidOn: '2026-12-01', reference: 'VIR-1' }, repo);
    list = await listBeneficiaries(repo);
    expect(list.find((b) => b.userId === 'parrain')!.earnings).toMatchObject({ paidCents: 6000, balanceCents: 0 });
  });
});
