import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStructuredRunnerForTests } from '@/lib/ai/structured';
import { MockProvider } from '@/lib/data/mock';
import { NexscopeProvider } from '@/lib/data/nexscope';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { Profile } from '@/lib/db/types';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { getPlan, isUnlimited, SAFETY_CAPS } from '@/lib/plans';
import { getRadar } from '@/lib/radar';
import {
  applyFilters,
  filterAvailability,
  filtersToParams,
  filterTarget,
  parseFilters,
} from '@/lib/radar-filters';
import { ALERT_KIND, checkAlerts, createAlert, type AlertData } from '@/lib/radar/alerts';
import { BADGE_RULES, badgesFor } from '@/lib/radar/badges';
import { bestValue, parseCompareIds } from '@/lib/radar/compare';
import { csvCell, radarToCsv } from '@/lib/radar/export';
import { mapKeywordResult, normalizeKeyword, runKeywordSearch, searchKeyword, type SearchSource } from '@/lib/radar/keyword-search';
import { categoryPath, productMetrics } from '@/lib/radar/metrics';
import { getFavorites, getRadarSettings, MAX_FAVORITES, saveRadarSettings, toggleFavorite } from '@/lib/radar/settings';
import { sortBy } from '@/lib/radar/sort';
import { computedWhyNow, ensureWhyNow, generateWhyNow, isValidWhyNow, readWhyNow, whyNowFacts } from '@/lib/radar/why-now';
import { addDays } from '@/lib/utils';
import { breakdown, details, NOW, product, TODAY } from './radar-helpers';

const searchFixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/nexscope-keyword-search.json'), 'utf8'));

async function makeUser(repo: LocalRepo, id: string, plan: Profile['plan'], extra: Partial<Profile> = {}) {
  await repo.ensureProfile({ id, email: `${id}@exemple.fr` });
  return repo.updateProfile(id, { niches: ['beaute'], plan, onboarded_at: NOW, ...extra });
}

afterEach(() => {
  vi.unstubAllEnvs();
  setStructuredRunnerForTests(null);
});

describe('bloc 1.1 · filtres avancés', () => {
  it('lit chaque paramètre, ignore les valeurs hors bornes, et fait l’aller-retour avec l’adresse', () => {
    const filters = parseFilters({
      souscat: 'Skincare',
      prixmin: '12,5',
      prixmax: '40',
      comeur: '2',
      v7: '100',
      v30: '400',
      croissance: '20',
      affmin: '5',
      affmax: '50',
      note: '4.5',
      avis: '10',
      nouveau: '1',
      badge: 'sous_exploite',
    });
    expect(filters).toEqual({
      souscat: 'Skincare',
      prixMin: 12.5,
      prixMax: 40,
      commissionEuros: 2,
      ventes7: 100,
      ventes30: 400,
      croissance: 20,
      affiliesMin: 5,
      affiliesMax: 50,
      note: 4.5,
      avis: 10,
      nouveau: true,
      badge: 'sous_exploite',
    });
    expect(parseFilters(Object.fromEntries(filtersToParams(filters)))).toEqual(filters);
    expect(parseFilters({ note: '4.2', croissance: '900', badge: 'magique', nouveau: 'oui', prixmin: 'abc' })).toEqual({});
  });

  it('filtre sur la sous-catégorie, les ventes, la note et les nouveautés ; une donnée absente écarte le produit', () => {
    const fresh = product('a', { details: details({ first_seen: addDays(TODAY, -5), rating: 4.7, review_count: 50 }), sales_30d: [100] });
    const old = product('b', {
      description: 'Catégorie TikTok Shop : Beauty & Personal Care › Haircare & Styling',
      details: details({ first_seen: addDays(TODAY, -200), rating: 4.1, review_count: 900 }),
    });
    const unknown = product('c', { description: 'Flacon de 30 ml.', details: null, active_affiliates: null });
    const all = [fresh, old, unknown];
    expect(categoryPath(fresh.description)).toEqual(['Beauty & Personal Care', 'Skincare', 'Toners']);
    expect(applyFilters(all, { souscat: 'skincare' }).map((p) => p.id)).toEqual(['a']);
    expect(applyFilters(all, { nouveau: true }).map((p) => p.id)).toEqual(['a']);
    expect(applyFilters(all, { note: 4.5 }).map((p) => p.id)).toEqual(['a']);
    expect(applyFilters(all, { avis: 100 }).map((p) => p.id)).toEqual(['b']);
    expect(applyFilters(all, { affiliesMax: 20 }).map((p) => p.id)).toEqual(['a', 'b']);
    // Ventes sur 7 jours : moyenne quotidienne du score (30 par jour) × 7 = 210.
    expect(applyFilters(all, { ventes7: 200 }).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(applyFilters(all, { ventes7: 250 })).toEqual([]);
    expect(applyFilters(all, { commissionEuros: 3, prixMax: 19 })).toEqual([]);
  });

  it('ne propose un filtre que si au moins un produit du jour a la donnée', () => {
    const bare = [product('x', { description: '', details: null, active_affiliates: null, latest_breakdown: breakdown({ croissance: null }, { growth_7d: null, daily_sales_7d: null }), sales_30d: [] })];
    const a = filterAvailability(bare.map(filterTarget));
    expect(a).toMatchObject({ subcategories: [], sales7: false, sales30: false, growth: false, affiliates: false, rating: false, reviews: false, newProducts: false, badges: [] });
    const rich = filterAvailability([product('y', { details: details({ rating: 4.5, review_count: 3, first_seen: TODAY, sales: { d1: 5, d7: 210, d15: 450, d30: 900, d60: null, d90: null } }) })].map(filterTarget));
    expect(rich).toMatchObject({ subcategories: ['Skincare'], sales7: true, sales30: true, growth: true, affiliates: true, rating: true, reviews: true, newProducts: true });
    expect(rich.badges).toContain('nouveau');
  });
});

describe('bloc 1.2 · badges automatiques', () => {
  const badges = (over: Parameters<typeof product>[1]) => badgesFor(productMetrics(product('p', over)));

  it('« Nouveau » : premier relevé de la source il y a moins de 30 jours, rien sans date', () => {
    expect(badges({ details: details({ first_seen: addDays(TODAY, -29) }) })).toContain('nouveau');
    expect(badges({ details: details({ first_seen: addDays(TODAY, -30) }) })).not.toContain('nouveau');
    expect(badges({ details: null })).not.toContain('nouveau');
  });

  it('« En accélération » : derniers jours > semaine > mois de 25 %, au moins 5 ventes par jour', () => {
    const series = [...Array(23).fill(10), 14, 14, 14, 14, 25, 25, 25];
    expect(badges({ sales_30d: series, latest_breakdown: breakdown({}, { growth_7d: 0.5, daily_sales_7d: 19 }) })).toContain('acceleration');
    const flat = Array(30).fill(10);
    expect(badges({ sales_30d: flat })).not.toContain('acceleration');
    // Trop peu de volume : 1 à 2 ventes par jour.
    expect(badges({ sales_30d: series.map((n) => n / 10), latest_breakdown: breakdown({}, { growth_7d: 0.5, daily_sales_7d: 2 }) })).not.toContain('acceleration');
  });

  it('« Sous-exploité » et « Saturé » demandent le nombre d’affiliés', () => {
    expect(badges({ active_affiliates: 5, latest_breakdown: breakdown({}, { daily_sales_7d: 30 }) })).toContain('sous_exploite');
    expect(badges({ active_affiliates: 200, latest_breakdown: breakdown({}, { daily_sales_7d: 20 }) })).toContain('sature');
    expect(badges({ active_affiliates: 20, latest_breakdown: breakdown({}, { daily_sales_7d: 20 }) })).toEqual([]);
    expect(badges({ active_affiliates: null, latest_breakdown: breakdown({}, { daily_sales_7d: 30 }) })).toEqual([]);
    expect(BADGE_RULES.underexploitedMaxRatio).toBe(0.5);
  });

  it('« En baisse » : −20 % sur 7 jours, ou rythme de la semaine sous 70 % du mois quand la croissance n’est pas mesurée', () => {
    expect(badges({ latest_breakdown: breakdown({}, { growth_7d: -0.3 }) })).toContain('baisse');
    const periods = details({ first_seen: addDays(TODAY, -60), sales: { d1: 10, d7: 70, d15: 200, d30: 600, d60: null, d90: null } });
    expect(badges({ details: periods, latest_breakdown: breakdown({ croissance: null }, { growth_7d: null }) })).toContain('baisse');
    expect(badges({ latest_breakdown: breakdown({}, { growth_7d: -0.1 }) })).not.toContain('baisse');
  });
});

describe('bloc 1.3 · pourquoi maintenant', () => {
  const repo = new LocalRepo(null);
  beforeEach(() => setRepoForTests(repo));
  afterAll(() => setRepoForTests(null));

  const p1 = product('nx-1', { active_affiliates: 5, latest_breakdown: breakdown({}, { growth_7d: 0.3, daily_sales_7d: 30 }) });
  const p2 = product('nx-2', { active_affiliates: 300, latest_breakdown: breakdown({}, { growth_7d: 0.05, daily_sales_7d: 20 }) });

  it('la phrase calculée ne cite que des chiffres fournis', () => {
    const sentence = computedWhyNow(p1);
    expect(sentence).toBe('Environ 30 ventes par jour pour seulement 5 affiliés : il reste de la place.');
    expect(isValidWhyNow(sentence, whyNowFacts(p1))).toBe(true);
  });

  it('refuse une phrase de l’IA qui invente un chiffre ou promet un gain', () => {
    const facts = whyNowFacts(p1);
    expect(isValidWhyNow('Les ventes montent de +30 % sur 7 jours, avec seulement 5 affiliés : fonce.', facts)).toBe(true);
    expect(isValidWhyNow('Les ventes ont doublé en 3 jours, 450 commandes hier.', facts)).toBe(false);
    expect(isValidWhyNow('Tu vas gagner de l’argent facile avec ce produit, résultat garanti.', facts)).toBe(false);
  });

  it('une génération par produit et par jour, partagée entre utilisateurs (cache serveur)', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'cle-test');
    let calls = 0;
    setStructuredRunnerForTests(async () => {
      calls++;
      return {
        items: [
          { id: 'nx-1', phrase: 'Environ 30 ventes par jour et seulement 5 affiliés : il reste de la place pour toi.' },
          { id: 'nx-2', phrase: 'Déjà 999 affiliés dessus.' },
        ],
      } as never;
    });
    expect(await ensureWhyNow([p1, p2], 'FR', TODAY, { repo })).toEqual({}); // pas d'IA pendant l'affichage du radar
    const first = await ensureWhyNow([p1, p2], 'FR', TODAY, { repo, allowAi: true });
    expect(first['nx-1']).toEqual({ sentence: 'Environ 30 ventes par jour et seulement 5 affiliés : il reste de la place pour toi.', source: 'ia' });
    expect(first['nx-2'].source).toBe('calcul'); // « 999 » n'est pas dans les chiffres
    const second = await ensureWhyNow([p1, p2], 'FR', TODAY, { repo, allowAi: true });
    expect(second).toEqual(first);
    expect(calls).toBe(1);
    expect(Object.keys(await readWhyNow('FR', TODAY, repo))).toEqual(['nx-1', 'nx-2']);
  });

  it('sans clé d’IA : phrase simulée, sans appel', async () => {
    let calls = 0;
    setStructuredRunnerForTests(async () => {
      calls++;
      return null;
    });
    const map = await generateWhyNow([p2]);
    expect(map['nx-2'].source).toBe('simulation');
    expect(calls).toBe(0);
  });
});

describe('bloc 1.4 · recherche par mot-clé (Nexscope)', () => {
  const raw = searchFixture.data.products as Record<string, unknown>[];

  it('appelle la route documentée tiktok-product-discovery avec keyword et la France', async () => {
    vi.stubEnv('NEXSCOPE_API_KEY', 'cle-nexscope-test');
    vi.stubEnv('DATA_RATE_PER_SECOND', '1000');
    const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(searchFixture), { status: 200 });
    }) as unknown as typeof fetch;
    const products = await new NexscopeProvider({ fetchImpl, sleep: async () => {} }).searchProducts('sérum', 'FR');
    expect(seen).toEqual([
      {
        url: 'https://api.nexscope.ai/api/skill-api/v1/skills/tiktok-product-discovery/run',
        body: { keyword: 'sérum', region: 'FR', orderField: 'day7_units_sold', page: 1, pageSize: 10 },
      },
    ]);
    expect(products).toHaveLength(4);
  });

  it('lit les champs documentés, avec les mêmes garde-fous que le relevé de nuit', () => {
    expect(mapKeywordResult(raw[0])).toEqual({
      id: 'nx-1729000000000000001',
      name: 'Sérum éclat vitamine C 30 ml',
      niche: 'beaute',
      category: ['Beauty & Personal Care', 'Skincare', 'Serums & Essences'],
      shop_name: 'Boutique A',
      image_url: 'https://agent-files.linkfox.com/fastmoss_images/exemple-serum.jpg',
      price_cents: 1290,
      price_min_cents: 1290,
      price_max_cents: 1990,
      commission_rate: 0.15,
      commission_cents: 194,
      sales_7d: 840,
      sales_month: 2600,
      sales_month_days: 28,
      affiliates: 35,
      rating: 4.6,
      review_count: 230,
    });
    expect(mapKeywordResult(raw[1])).toBeNull(); // dollars
    expect(mapKeywordResult(raw[2])).toBeNull(); // pas de commission affiliée
    expect(mapKeywordResult(raw[3])).toMatchObject({ niche: null, commission_rate: 0.12, price_min_cents: null });
    expect(normalizeKeyword('  Sérum   ÉCLAT <b> ')).toBe('sérum éclat b');
    expect(normalizeKeyword('a')).toBeNull();
  });

  it('quota par plan côté serveur, même mot-clé non recompté dans la journée, cache partagé de 24 h', async () => {
    const repo = new LocalRepo(null);
    setRepoForTests(repo);
    let calls = 0;
    const source: SearchSource = {
      searchProducts: async () => {
        calls++;
        return raw;
      },
    };
    const none = await makeUser(repo, 'r-aucun', 'aucun');
    const starter = await makeUser(repo, 'r-starter', 'starter');
    const other = await makeUser(repo, 'r-pro', 'pro');
    expect([getPlan('starter'), getPlan('pro'), getPlan('elite')].map((p) => p.keywordSearchesPerDay)).toEqual([3, 15, 50]);
    expect(await runKeywordSearch(none, 'sérum', { repo, source })).toEqual({ ok: false, reason: 'plan' });
    const first = await runKeywordSearch(starter, 'Sérum', { repo, source });
    expect(first).toMatchObject({ ok: true, reused: false });
    expect(await runKeywordSearch(starter, 'sérum ', { repo, source })).toMatchObject({ ok: true, reused: true });
    for (const word of ['gourde', 'lisseur']) expect((await runKeywordSearch(starter, word, { repo, source })).ok).toBe(true);
    expect(await runKeywordSearch(starter, 'tapis', { repo, source })).toEqual({ ok: false, reason: 'quota' });
    // Le mot-clé déjà cherché aujourd'hui reste ouvert, même quota épuisé.
    expect(await runKeywordSearch(starter, 'gourde', { repo, source })).toMatchObject({ ok: true, reused: true });
    // Un autre utilisateur, même mot-clé : servi par le cache, sans nouvel appel.
    expect(calls).toBe(3);
    await runKeywordSearch(other, 'sérum', { repo, source });
    expect(calls).toBe(3);
    const record = await repo.getRecord<{ results: unknown[]; skipped: number }>(starter.id, (first as { id: string }).id);
    expect(record?.data.results).toHaveLength(2);
    expect(record?.data.skipped).toBe(2);
    setRepoForTests(null);
  });

  it('sans clé Nexscope : recherche dans le catalogue du jour, dite comme telle', async () => {
    const repo = new LocalRepo(null);
    await repo.upsertProducts([product('nx-10', { name: 'Gourde isotherme inox' }), product('nx-11', { name: 'Sérum éclat' })]);
    const found = await searchKeyword('gourde', 'FR', { repo });
    expect(found.source).toBe('catalogue');
    expect(found.results.map((r) => r.id)).toEqual(['nx-10']);
  });
});

describe('bloc 1.5 · favoris et comparateur', () => {
  it('ajoute, retire et plafonne les favoris', async () => {
    const repo = new LocalRepo(null);
    expect(await toggleFavorite('u', 'p1', repo)).toBe(true);
    expect(await toggleFavorite('u', 'p2', repo)).toBe(true);
    expect(await getFavorites('u', repo)).toEqual(['p2', 'p1']);
    expect(await toggleFavorite('u', 'p1', repo)).toBe(false);
    expect(await getFavorites('u', repo)).toEqual(['p2']);
    for (let i = 0; i < 60; i++) await toggleFavorite('u', `x${i}`, repo);
    expect(await getFavorites('u', repo)).toHaveLength(MAX_FAVORITES);
    expect(await getFavorites('autre', repo)).toEqual([]);
  });

  it('compare 2 à 4 produits (Pro), marque le meilleur de chaque ligne', () => {
    expect(getPlan('aucun').compare).toBe(false);
    expect(getPlan('starter').compare).toBe(false);
    expect(getPlan('pro').compare).toBe(true);
    expect(getPlan('elite').compare).toBe(true);
    expect(parseCompareIds(['a,b', 'b', 'c d', 'e'])).toEqual(['a', 'b', 'e']);
    expect(bestValue([3, null, 7])).toBe(7);
    expect(bestValue([30, 12], true)).toBe(12);
    expect(bestValue([5, null])).toBeNull();
  });
});

describe('bloc 1.6 · alertes personnalisées', () => {
  const repo = new LocalRepo(null);
  beforeAll(async () => {
    setRepoForTests(repo);
    await repo.upsertProducts([
      product('nx-a1', { commission_rate: 0.25 }),
      product('nx-a2', { commission_rate: 0.1 }),
      product('nx-a3', { niche: 'maison', commission_rate: 0.3 }),
    ]);
  });
  afterAll(() => setRepoForTests(null));

  it('limite côté serveur : sans abonnement 0, Starter 3, Pro 15, et une règle sans critère est refusée', async () => {
    expect([getPlan('aucun'), getPlan('starter'), getPlan('pro')].map((p) => p.alerts)).toEqual([0, 3, 15]);
    const none = await makeUser(repo, 'al-aucun', 'aucun');
    const starter = await makeUser(repo, 'al-starter', 'starter');
    const channels = { push: true, email: true, discord: true };
    expect(await createAlert(none, { criteria: { commission: 20 }, channels }, repo)).toEqual({ ok: false, error: 'plan' });
    expect(await createAlert(starter, { criteria: {}, channels }, repo)).toEqual({ ok: false, error: 'criteres' });
    const created = await createAlert(starter, { criteria: { niche: 'beaute', commission: 20 }, channels }, repo);
    expect(created).toMatchObject({ ok: true, matches: 1 });
    if (created.ok) expect(created.alert.data.known_ids).toEqual(['nx-a1']);
    await createAlert(starter, { criteria: { commission: 25 }, channels }, repo);
    await createAlert(starter, { criteria: { niche: 'maison' }, channels }, repo);
    expect(await createAlert(starter, { criteria: { niche: 'tech' }, channels }, repo)).toEqual({ ok: false, error: 'limite' });
    // Le même compte passé en Pro peut en créer d'autres.
    await repo.updateProfile(starter.id, { plan: 'pro' });
    expect(await createAlert({ ...starter, plan: 'pro' }, { criteria: { niche: 'tech' }, channels }, repo)).toMatchObject({ ok: true });
  });

  it('Elite : « illimité » à l’écran, plafond de sécurité côté serveur', async () => {
    expect(isUnlimited('elite', 'alerts')).toBe(true);
    expect(isUnlimited('pro', 'alerts')).toBe(false);
    expect(getPlan('elite').alerts).toBe(SAFETY_CAPS.alerts);
    const elite = await makeUser(repo, 'al-elite', 'elite');
    const channels = { push: true, email: false, discord: false };
    for (let i = 0; i < SAFETY_CAPS.alerts; i++) {
      await repo.saveRecord<AlertData>(elite.id, ALERT_KIND, {
        name: `a${i}`, criteria: { commission: i + 1 }, active: true, channels, region: 'FR', known_ids: [], last_checked: null, last_sent: null, last_count: 0,
      } as unknown as AlertData);
    }
    expect(await createAlert(elite, { criteria: { niche: 'tech' }, channels }, repo)).toEqual({ ok: false, error: 'limite' });
  });

  it('chaque nuit : notifie les nouveaux produits, une fois par alerte et par jour', async () => {
    const user = await makeUser(repo, 'al-nuit', 'elite');
    const created = await createAlert(user, { name: 'Beauté généreuse', criteria: { niche: 'beaute', commission: 20 }, channels: { push: true, email: true, discord: false } }, repo);
    expect(created.ok).toBe(true);
    // Un nouveau produit remplit la règle.
    const all = await repo.listProducts();
    await repo.upsertProducts([...all.map((p) => ({ ...p, updated_at: NOW })), product('nx-a4', { commission_rate: 0.22, name: 'Crème nouvelle' })]);
    const summary = await checkAlerts(TODAY, repo);
    expect(summary.notifiees).toBeGreaterThanOrEqual(1);
    const notifications = await repo.listRecords<{ type: string; title: string; path: string }>(user.id, 'notification');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].data).toMatchObject({ type: 'alerte', path: '/app/produit/nx-a4' });
    expect(notifications[0].data.title).toContain('Beauté généreuse');
    // Encore un nouveau produit le même jour : pas de deuxième notification, il reste à annoncer.
    await repo.upsertProducts([...(await repo.listProducts()).map((p) => ({ ...p, updated_at: NOW })), product('nx-a5', { commission_rate: 0.24 })]);
    await checkAlerts(TODAY, repo);
    expect(await repo.listRecords(user.id, 'notification')).toHaveLength(1);
    const [alert] = await repo.listRecords<AlertData>(user.id, ALERT_KIND);
    expect(alert.data.known_ids).toContain('nx-a4');
    expect(alert.data.known_ids).not.toContain('nx-a5');
    expect(alert.data.last_count).toBe(3);
  });

  it('après une résiliation (sans abonnement), les alertes ne sont plus vérifiées', async () => {
    const user = await makeUser(repo, 'al-bas', 'pro');
    await createAlert(user, { criteria: { niche: 'beaute' }, channels: { push: true, email: false, discord: false } }, repo);
    await repo.updateProfile(user.id, { plan: 'aucun' });
    const summary = await checkAlerts(TODAY, repo);
    expect(summary.ignorees).toBeGreaterThanOrEqual(1);
    expect(await repo.listRecords(user.id, 'notification')).toHaveLength(0);
  });
});

describe('bloc 1.7 · vues et tri mémorisés', () => {
  const repo = new LocalRepo(null);
  beforeAll(async () => {
    setRepoForTests(repo);
    await refreshCatalog({ repo, provider: new MockProvider(), date: TODAY });
  });
  afterAll(() => setRepoForTests(null));

  it('mémorise la vue et le tri par utilisateur, nettoie les valeurs inconnues', async () => {
    expect(await getRadarSettings('v1', repo)).toEqual({ vue: 'cartes', tri: 'score', ordre: 'desc', poids: null });
    await saveRadarSettings('v1', { vue: 'liste', tri: 'prix' }, repo);
    expect(await getRadarSettings('v1', repo)).toMatchObject({ vue: 'liste', tri: 'prix', ordre: 'asc' });
    await saveRadarSettings('v1', { tri: 'n-importe' as never }, repo);
    expect((await getRadarSettings('v1', repo)).tri).toBe('score');
    expect(await getRadarSettings('v2', repo)).toMatchObject({ vue: 'cartes' });
  });

  it('trie sur n’importe quelle colonne, valeurs inconnues en dernier', async () => {
    expect(sortBy([{ v: 2 }, { v: null }, { v: 1 }], 'asc', (x) => x.v).map((x) => x.v)).toEqual([1, 2, null]);
    expect(sortBy([{ v: 2 }, { v: null }, { v: 1 }], 'desc', (x) => x.v).map((x) => x.v)).toEqual([2, 1, null]);
    const pro = await makeUser(repo, 'v-pro', 'pro');
    const radar = await getRadar(pro, {}, { sort: 'prix', order: 'asc' });
    const prices = radar.items.flatMap((i) => (i.kind === 'visible' ? [i.product.price_cents] : []));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(radar.items[0].rank).toBe(1);
  });

  it('sans abonnement : aucun produit visible, et un tri par score retombe sur le classement du jour', async () => {
    const none = await makeUser(repo, 'v-aucun', 'aucun');
    const radar = await getRadar(none, {}, { sort: 'pourtoi' });
    expect(radar.sort).toBe('score');
    expect(radar.visibleCount).toBe(0);
    expect(radar.lockedCount).toBeGreaterThan(0);
    expect(radar.items.every((i) => i.kind === 'locked')).toBe(true);
    // Un produit verrouillé ne transporte ni nom, ni identifiant, ni chiffre.
    for (const item of radar.items) expect(Object.keys(item).sort()).toEqual(['key', 'kind', 'niche', 'rank']);
  });

  it('Starter : tri sur tout le radar avec le score, sans le score « pour toi » (à partir de Pro)', async () => {
    const starter = await makeUser(repo, 'v-starter', 'starter');
    const sorted = await getRadar(starter, {}, { sort: 'prix', order: 'desc' });
    expect(sorted.lockedCount).toBe(0);
    const visible = sorted.items.flatMap((i) => (i.kind === 'visible' ? [i.product] : []));
    expect(visible.length).toBe(sorted.totalToday);
    const prices = visible.map((p) => p.price_cents);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
    expect(visible.every((p) => p.score !== null)).toBe(true);
    expect(visible.every((p) => p.personal_score === null)).toBe(true);

    const pro = await makeUser(repo, 'v-pro2', 'pro');
    const proRadar = await getRadar(pro, {});
    expect(proRadar.items.every((i) => i.kind === 'visible' && i.product.personal_score !== null)).toBe(true);
  });
});

describe('bloc 1.8 · export CSV (Elite)', () => {
  const repo = new LocalRepo(null);
  beforeAll(async () => {
    setRepoForTests(repo);
    await refreshCatalog({ repo, provider: new MockProvider(), date: TODAY });
  });
  afterAll(() => setRepoForTests(null));

  it('format Excel français, cellules neutralisées, jamais de produit verrouillé', async () => {
    expect(getPlan('starter').radarExport).toBe(false);
    expect(getPlan('pro').radarExport).toBe(false);
    expect(getPlan('elite').radarExport).toBe(true);
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(-25)).toBe('-25');
    expect(csvCell(12.5)).toBe('12,5');
    expect(csvCell(null)).toBe('');

    // Sans abonnement : tout est verrouillé, le fichier n'a que l'en-tête.
    const none = await makeUser(repo, 'x-aucun', 'aucun');
    const locked = await getRadar(none, {});
    expect(locked.lockedCount).toBeGreaterThan(0);
    const empty = radarToCsv(locked.items, 'https://exemple.fr');
    expect(empty.trim().split('\r\n')).toHaveLength(1);
    expect(empty).not.toContain('/app/produit/');

    const elite = await makeUser(repo, 'x-elite', 'elite');
    const radar = await getRadar(elite, {});
    const csv = radarToCsv(radar.items, 'https://exemple.fr');
    expect(csv.startsWith('\uFEFFRang;Produit;Niche;')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(1 + radar.visibleCount);
    expect(lines[1]).toContain('https://exemple.fr/app/produit/');
    const header = lines[0].replace('\uFEFF', '').split(';');
    expect(lines[1].split(';')[header.indexOf('Score')]).toMatch(/^\d+$/);
  });
});
