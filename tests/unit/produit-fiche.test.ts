import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setStructuredRunnerForTests } from '@/lib/ai/structured';
import { findList, mapNexscopeDetails, NexscopeProvider } from '@/lib/data/nexscope';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { TopVideo } from '@/lib/db/types';
import { getPlan, SAFETY_CAPS } from '@/lib/plans';
import {
  durationLabel,
  generateHookAnalysis,
  guessHookType,
  HOOK_KIND,
  hookIsQuoted,
  requestHookAnalysis,
  simulateHookAnalysis,
} from '@/lib/radar/hook-analysis';
import { productMetrics } from '@/lib/radar/metrics';
import { CREATORS_SECTION, productActionLinks } from '@/lib/radar/product-page';
import { sameShopProducts, similarProducts } from '@/lib/radar/similar';
import { SIMULATION_DEFAULTS, simulateEarnings } from '@/lib/radar/simulation';
import { breakdown, details, NOW, product } from './radar-helpers';

const detailFixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/nexscope-et-batch-product-detail.reel.json'), 'utf8'));

afterEach(() => {
  vi.unstubAllEnvs();
  setStructuredRunnerForTests(null);
  setRepoForTests(null);
});

describe('bloc 3.1 · chiffres de la fiche', () => {
  it('prix minimum, maximum et chiffre d’affaires : seulement si la source déclare des euros', () => {
    const [real] = findList(detailFixture, 'products') ?? [];
    const fromReal = mapNexscopeDetails(real, NOW)!;
    // Vraie réponse : pas de devise, prix annoncés en dollars par la doc → rien n'est lu.
    expect(fromReal.price_min_cents).toBeUndefined();
    expect(fromReal.revenue_cents).toBeUndefined();
    const euro = mapNexscopeDetails({ ...real, currency: '€', minPrice: 12.9, maxPrice: 19.9, totalSaleGmv7dAmt: 1000, totalSaleGmv30dAmt: 4200.5 }, NOW)!;
    expect(euro).toMatchObject({ price_min_cents: 1290, price_max_cents: 1990, revenue_cents: { d7: 100000, d30: 420050 } });
    expect(mapNexscopeDetails({ ...real, currency: 'USD', minPrice: 12.9 }, NOW)!.price_min_cents).toBeUndefined();
  });

  it('ventes sur 7 et 30 jours : nos relevés, sinon la source ; deux sources contradictoires → rien', () => {
    const series = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(productMetrics(product('a', { sales_30d: series }))).toMatchObject({ sales_7d: 24 + 25 + 26 + 27 + 28 + 29 + 30, sales_30d: 465 });
    const short = product('b', { sales_30d: [40], latest_breakdown: breakdown({}, { daily_sales_7d: 40 }), details: details({ sales: { d1: 50, d7: 300, d15: 600, d30: 1200, d60: null, d90: null } }) });
    expect(productMetrics(short)).toMatchObject({ sales_7d: 280, sales_30d: 1200 });
    const contradictory = product('c', { sales_30d: [40], latest_breakdown: breakdown({}, { daily_sales_7d: 40 }), details: details({ sales: { d1: 1, d7: 5, d15: 9, d30: 100, d60: null, d90: null } }) });
    expect(productMetrics(contradictory).sales_30d).toBeNull();
    expect(productMetrics(product('d', { details: null, sales_30d: [], latest_breakdown: null }))).toMatchObject({ sales_7d: null, sales_30d: null, rating: null });
  });
});

describe('bloc 3.2 · simulation', () => {
  it('valeurs par défaut prudentes et résultat en fourchette', () => {
    expect(SIMULATION_DEFAULTS).toEqual({ views: 500, clickRate: 1, conversionRate: 2, videos: 20 });
    // 20 vidéos × 500 vues × 1 % × 2 % = 2 ventes ; fourchette de la moitié à une fois et demie.
    expect(simulateEarnings({ commissionCents: 300 })).toEqual({
      clicks: 100,
      sales: { low: 1, mid: 2, high: 3 },
      commission_cents: { low: 300, mid: 600, high: 900 },
    });
  });

  it('borne les hypothèses saisies', () => {
    const result = simulateEarnings({ views: -50, clickRate: 250, conversionRate: Number.NaN, videos: 0, commissionCents: 100 });
    expect(result.sales).toEqual({ low: 0, mid: 0, high: 0 });
    expect(simulateEarnings({ views: 10_000, clickRate: 2, conversionRate: 3, videos: 1, commissionCents: 250 }).commission_cents).toEqual({ low: 750, mid: 1500, high: 2250 });
  });
});

const videos: TopVideo[] = [
  { title: 'Tu savais que ce sérum tient 12 heures ? Je te montre.', views: 120_000, estimated_sales: 300, hook: null, format: 'Vidéo', duration_s: 18 },
  { title: 'Marre des cheveux qui frisent ? Voici la routine.', views: 80_000, estimated_sales: 120, hook: null, format: 'Vidéo', duration_s: 34 },
  { title: 'Vidéo sans description', views: 5_000, estimated_sales: 10, hook: null, format: 'Vidéo', duration_s: null },
];

describe('bloc 3.3 · accroches des vidéos qui vendent', () => {
  it('analyse simulée : type, durée lue dans la source, structure', () => {
    const analysis = simulateHookAnalysis(videos);
    expect(analysis.videos.map((v) => v.hook_type)).toEqual(['question', 'question', 'autre']);
    expect(analysis.videos.map((v) => v.duration)).toEqual(['court (18 s)', 'moyen (34 s)', null]);
    expect(analysis.videos[2].hook).toBe('Texte non fourni par la source');
    expect(analysis.summary).toContain('question (2 vidéos sur 3)');
    expect(durationLabel(75)).toBe('long (75 s)');
    expect(guessHookType('Avant / après en une semaine')).toBe('resultat');
    expect(guessHookType('J’ai testé pendant un mois')).toBe('demonstration');
  });

  it('une accroche de l’IA qui n’est pas recopiée du texte est remplacée', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'cle-test');
    expect(hookIsQuoted('Tu savais que ce sérum tient 12 heures ?', videos[0])).toBe(true);
    expect(hookIsQuoted('Ce sérum va changer ta vie', videos[0])).toBe(false);
    setStructuredRunnerForTests(async () => ({
      summary: 'Les questions directes reviennent souvent.',
      videos: [
        { index: 1, hook: 'Ce sérum va changer ta vie', hook_type: 'curiosite', structure: 'Accroche puis démonstration.', why: 'Effet de surprise.' },
        { index: 2, hook: 'Marre des cheveux qui frisent ?', hook_type: 'probleme', structure: 'Problème, solution, preuve.', why: 'On se reconnaît.' },
      ],
    }) as never);
    const analysis = await generateHookAnalysis(videos);
    expect(analysis.source).toBe('ia');
    expect(analysis.videos[0].hook).toBe('Tu savais que ce sérum tient 12 heures ?');
    expect(analysis.videos[0].hook_type).toBe('curiosite');
    expect(analysis.videos[1]).toMatchObject({ hook: 'Marre des cheveux qui frisent ?', hook_type: 'probleme', duration: 'moyen (34 s)' });
    expect(analysis.videos[2].hook_type).toBe('autre');
  });

  it('quota par plan côté serveur ; une analyse en cache ne coûte rien', async () => {
    const repo = new LocalRepo(null);
    setRepoForTests(repo);
    const p = product('nx-v', { top_videos: videos });
    expect(await requestHookAnalysis({ id: 'f', plan: 'aucun' }, p, repo)).toEqual({ ok: false, reason: 'plan' });
    expect(await requestHookAnalysis({ id: 's', plan: 'starter' }, p, repo)).toEqual({ ok: false, reason: 'plan' });
    expect([getPlan('starter'), getPlan('pro'), getPlan('elite')].map((x) => x.hookAnalysesPerDay)).toEqual([0, 10, SAFETY_CAPS.hookAnalysesPerDay]);
    expect(await requestHookAnalysis({ id: 'u', plan: 'pro' }, product('nx-sans', { top_videos: [] }), repo)).toEqual({ ok: false, reason: 'videos' });
    const first = await requestHookAnalysis({ id: 'u', plan: 'pro' }, p, repo);
    expect(first).toMatchObject({ ok: true, fromCache: false });
    const second = await requestHookAnalysis({ id: 'autre', plan: 'pro' }, p, repo);
    expect(second).toMatchObject({ ok: true, fromCache: true });
    expect(await repo.countRecordsSince('autre', HOOK_KIND, '2000-01-01')).toBe(0);
    for (let i = 1; i < getPlan('pro').hookAnalysesPerDay; i++) await repo.saveRecord('u', HOOK_KIND, { product_id: `x${i}` });
    expect(await requestHookAnalysis({ id: 'u', plan: 'pro' }, product('nx-w', { top_videos: videos.slice(0, 1) }), repo)).toEqual({ ok: false, reason: 'quota' });
  });
});

describe('bloc 3.4 · créateurs qui vendent le produit', () => {
  it('section masquée : aucune route documentée ne donne leurs ventes ni leur nom public', () => {
    expect(CREATORS_SECTION.shown).toBe(false);
    expect(CREATORS_SECTION.checkedRoute).toBe('chuhaijiang-tiktok-product-related-creators');
    expect('fetchProductCreators' in NexscopeProvider.prototype).toBe(false);
  });
});

describe('bloc 3.5 · produits similaires et même boutique', () => {
  const p = product('p', { shop_name: 'Boutique A' });
  const catalog = [
    p,
    product('s1', { latest_score: 70, shop_name: 'Autre' }),
    product('s2', { latest_score: 80, shop_name: ' boutique  a ' }),
    product('h', { description: 'Catégorie TikTok Shop : Beauty & Personal Care › Haircare & Styling', shop_name: 'Boutique A', latest_score: 90 }),
    product('m', { niche: 'maison', description: '', shop_name: 'Boutique M' }),
  ];

  it('même sous-catégorie TikTok Shop d’abord, triés par score', () => {
    expect(similarProducts(p, catalog)).toEqual({ basis: 'souscat', label: 'Skincare', products: [catalog[2], catalog[1]] });
    const noCategory = product('n', { description: '' });
    expect(similarProducts(noCategory, catalog).basis).toBe('niche');
    expect(similarProducts(noCategory, catalog).products.map((x) => x.id)).toEqual(['h', 's2', 's1', 'p']);
  });

  it('même boutique, sans tenir compte de la casse ni des espaces ; rien sans boutique', () => {
    expect(sameShopProducts(p, catalog).map((x) => x.id)).toEqual(['h', 's2']);
    expect(sameShopProducts(product('z', { shop_name: '' }), catalog)).toEqual([]);
  });
});

describe('bloc 3.6 · boutons de la fiche', () => {
  it('scripts, plan de 20 vidéos, alerte pré-remplie, comparateur', () => {
    expect(productActionLinks('nx-12')).toEqual({
      scripts: '/app/studio?produit=nx-12',
      plan: '/app/plan?produit=nx-12',
      alert: '/app/alertes?produit=nx-12',
      compare: '/app/comparer',
    });
  });
});
