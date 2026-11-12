import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectLiveCatalog } from '@/lib/catalog';
import { MemoryCache } from '@/lib/data/http';
import { MockProvider } from '@/lib/data/mock';
import {
  NexscopeProvider,
  checkNexscopeResponse,
  findList,
  mapNexscopeProduct,
  mapNexscopeVideo,
  type NexscopeDiscoveryProduct,
} from '@/lib/data/nexscope';
import type { ProductDataProvider, ProviderProduct } from '@/lib/data/provider';
import { TikTokProvider, mapTikTokProduct, parseCategoryMap, signTikTokRequest, type TikTokOpenProduct } from '@/lib/data/tiktok';
import { LocalRepo } from '@/lib/db/local';
import type { Product } from '@/lib/db/types';
import { refreshCatalog } from '@/lib/jobs/refresh';

const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8'));
const tiktokFixture = fixture('tiktok-search-open-collaboration-products.json');
const nexscopeFixture = fixture('nexscope-tiktok-product-discovery.json');
const videoFixture = fixture('nexscope-tiktok-video-search.json');

const SECRETS = { TIKTOK_APP_KEY: 'cle-app-test', TIKTOK_APP_SECRET: 'secret-app-test', TIKTOK_ACCESS_TOKEN: 'jeton-createur-test', NEXSCOPE_API_KEY: 'cle-nexscope-test' };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

const noSleep = vi.fn(async (_ms: number) => undefined);

beforeEach(() => {
  noSleep.mockClear();
  vi.stubEnv('DATA_RATE_PER_SECOND', '1000');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TikTok Shop : correspondance des champs (réponse d’exemple)', () => {
  const products = tiktokFixture.data.products as TikTokOpenProduct[];

  it('fait correspondre un produit France complet', () => {
    const result = mapTikTokProduct(products[0]);
    expect(result).toEqual({
      ok: true,
      product: {
        id: 'tts-1729432087292775344',
        name: 'Sérum hydratant à l’acide hyaluronique 30 ml'.replace('’', "'"),
        niche: 'beaute',
        description: 'Catégorie TikTok Shop : Beauté et soins personnels › Soins du visage',
        shop_name: 'Boutique Exemple Beauté',
        price_cents: 2460, // prix promo le plus bas
        commission_rate: 0.15, // 1500 centièmes de pour cent
        free_sample: null, // non fourni par cette API
        active_affiliates: null, // non fourni par cette API
        image_url: products[0].main_image_url,
        estimated_sales: null,
        units_sold_total: 12123,
        sales_windows: null,
      },
    });
  });

  it('laisse vide ce qui manque et refuse une image d’un domaine non autorisé', () => {
    const result = mapTikTokProduct(products[1]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product).toMatchObject({ niche: 'maison', units_sold_total: null, image_url: '', commission_rate: 0.2 });
    expect(result.rejectedImageHost).toBe('images.example.com');
  });

  it('écarte un produit hors de France, hors de nos niches ou en rupture', () => {
    expect(mapTikTokProduct(products[2])).toMatchObject({ ok: false });
    expect(mapTikTokProduct(products[3])).toEqual({ ok: false, reason: 'catégorie hors des niches suivies' });
    expect(mapTikTokProduct(products[4])).toEqual({ ok: false, reason: 'plus en stock' });
  });

  it('signe les requêtes comme l’exemple officiel', () => {
    const sign = signTikTokRequest('/authorization/202309/shops', { app_key: '29a39d', timestamp: '1623812664' }, '', 'e59af819cc');
    expect(sign).toBe('b596b73e0cc6de07ac26f036364178ab16b0a907af13d43f0a0cd2345f582dc8');
  });

  it('lit la correspondance niche → catégorie de premier niveau', () => {
    expect(parseCategoryMap('beaute:601450, maison:600001, inconnu:1, tech:abc')).toEqual({ beaute: '601450', maison: '600001' });
  });
});

describe('TikTokProvider : appels, reprises, quota et cache', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(SECRETS)) vi.stubEnv(k, v);
  });

  it('appelle le bon point d’accès, signé, sans jamais mettre un secret dans la clé de cache', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse(tiktokFixture));
    const cache = new MemoryCache();
    const setSpy = vi.spyOn(cache, 'set');
    const provider = new TikTokProvider({ fetchImpl: fetchImpl as unknown as typeof fetch, cache, sleep: noSleep });
    const found = await provider.fetchTrendingProducts({ country: 'FR', date: '2026-11-12' });

    expect(found.map((p) => p.id)).toEqual(['tts-1729432087292775344', 'tts-1729432087292775345']);
    const [url, init] = fetchImpl.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe('https://open-api.tiktokglobalshop.com/affiliate_creator/202405/open_collaborations/products/search');
    expect(parsed.searchParams.get('app_key')).toBe(SECRETS.TIKTOK_APP_KEY);
    expect(parsed.searchParams.get('page_size')).toBe('20');
    expect(parsed.searchParams.get('sort_field')).toBe('units_sold');
    expect(parsed.searchParams.get('sign')).toMatch(/^[0-9a-f]{64}$/);
    expect((init?.headers as Record<string, string>)['x-tts-access-token']).toBe(SECRETS.TIKTOK_ACCESS_TOKEN);

    const key = setSpy.mock.calls[0][0];
    for (const secret of Object.values(SECRETS)) expect(key).not.toContain(secret);
    expect(provider.stats()).toMatchObject({ calls: 1, skipped: 3, rejectedImageHosts: ['images.example.com'] });

    // Même jour, même cache : aucun nouvel appel payant.
    const again = new TikTokProvider({ fetchImpl: fetchImpl as unknown as typeof fetch, cache, sleep: noSleep });
    await again.fetchTrendingProducts({ country: 'FR', date: '2026-11-12' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(again.stats().cacheHits).toBe(1);
  });

  it('reprend après un 429 en respectant Retry-After, puis après le code « trop de requêtes »', async () => {
    const responses = [
      jsonResponse({ code: 36009002, message: 'Too many requests' }, 429, { 'retry-after': '3' }),
      jsonResponse({ code: 36009002, message: 'Too many requests' }),
      jsonResponse(tiktokFixture),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const provider = new TikTokProvider({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep });
    const found = await provider.fetchTrendingProducts({ country: 'FR', date: '2026-11-12' });
    expect(found).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // Les attentes courtes viennent du débit (file d'attente) ; les longues sont les reprises.
    const waits = noSleep.mock.calls.map(([ms]) => ms).filter((ms) => ms >= 100);
    expect(waits[0]).toBe(3000); // Retry-After
    expect(waits[1]).toBeGreaterThanOrEqual(2000); // attente progressive (2e essai)
    expect(provider.stats().retries).toBe(2);
  });

  it('ne rejoue pas une erreur de jeton et le dit clairement', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: 105002, message: 'Expired credentials' }));
    const provider = new TikTokProvider({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep });
    await expect(provider.fetchTrendingProducts({ country: 'FR', date: '2026-11-12' })).rejects.toThrow('jeton créateur expiré');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('s’arrête au quota de la nuit en gardant ce qui a été lu', async () => {
    vi.stubEnv('DATA_MAX_CALLS_PER_NIGHT', '2');
    const page = { ...tiktokFixture, data: { ...tiktokFixture.data, next_page_token: 'page-suivante' } };
    const fetchImpl = vi.fn(async () => jsonResponse(page));
    const provider = new TikTokProvider({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep });
    const found = await provider.fetchTrendingProducts({ country: 'FR', date: '2026-11-12' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(found.length).toBeGreaterThan(0);
    expect(provider.stats()).toMatchObject({ calls: 2, budget: 2, budgetReached: true });
  });

  it('exige le jeton du compte créateur', async () => {
    vi.stubEnv('TIKTOK_ACCESS_TOKEN', '');
    const provider = new TikTokProvider({ sleep: noSleep });
    await expect(provider.fetchTrendingProducts({ country: 'FR', date: '2026-11-12' })).rejects.toThrow('TIKTOK_ACCESS_TOKEN');
  });
});

describe('Nexscope : correspondance des champs (réponse d’exemple)', () => {
  const products = findList(nexscopeFixture, 'products') as NexscopeDiscoveryProduct[];

  it('trouve la liste dans l’enveloppe et fait correspondre un produit complet', () => {
    expect(products).toHaveLength(4);
    expect(mapNexscopeProduct(products[0], 'beaute')).toEqual({
      ok: true,
      product: {
        id: 'nx-1731000000000000001',
        name: 'Gloss repulpant effet miroir',
        niche: 'beaute',
        description: 'Catégorie TikTok Shop : Beauty & Personal Care',
        shop_name: 'Boutique Exemple Lèvres',
        price_cents: 1290,
        commission_rate: 0.18,
        free_sample: null, // aucun champ chez Nexscope
        active_affiliates: 212, // totalIflCnt
        image_url: products[0].imageUrl,
        estimated_sales: 420, // totalSale1dCnt
        units_sold_total: 18450,
        sales_windows: { last7: 2310, prev7: 1100 }, // (5 610 − 2 310) / 3
      },
    });
  });

  it('accepte une devise absente (euro en France), une commission en pourcentage, et laisse vide le reste', () => {
    const result = mapNexscopeProduct(products[1], 'beaute');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product).toMatchObject({
      commission_rate: 0.15,
      active_affiliates: null,
      estimated_sales: null,
      sales_windows: null,
      image_url: '',
    });
    expect(result.rejectedImageHost).toBe('cdn.example.org');
  });

  it('écarte un produit sans commission ou hors de France', () => {
    expect(mapNexscopeProduct(products[2], 'beaute')).toEqual({ ok: false, reason: 'commission absente' });
    expect(mapNexscopeProduct(products[3], 'beaute')).toEqual({ ok: false, reason: 'région ES' });
  });

  it('lit les vidéos sans données du créateur', () => {
    const videos = (findList(videoFixture, 'data') ?? []).map(mapNexscopeVideo);
    expect(videos).toEqual([
      { title: 'Je teste le gloss repulpant pendant 7 jours #gloss', views: 182000, estimated_sales: 640, hook: null, format: 'Vidéo' },
      { title: 'Vidéo sans description', views: 950000, estimated_sales: 1210, hook: null, format: 'Vidéo' },
    ]);
  });

  it('rejoue le code 13012 mais pas une clé refusée', () => {
    expect(() => checkNexscopeResponse({ status: 429, json: { code: 13012, msg: 'rate' }, retryAfterMs: 1000 })).toThrow(
      expect.objectContaining({ retryable: true, retryAfterMs: 1000 }),
    );
    expect(() => checkNexscopeResponse({ status: 401, json: { code: 11209, msg: 'bad key' }, retryAfterMs: null })).toThrow(
      expect.objectContaining({ retryable: false, message: expect.stringContaining('clé d’API refusée') }),
    );
    expect(() => checkNexscopeResponse({ status: 200, json: { code: 0, data: { errcode: 500, errmsg: 'upstream' } }, retryAfterMs: null })).toThrow(
      'erreur du prestataire',
    );
  });

  it('interroge chaque niche en France, triée par ventes sur 7 jours', async () => {
    vi.stubEnv('NEXSCOPE_API_KEY', SECRETS.NEXSCOPE_API_KEY);
    vi.stubEnv('DATA_PAGES_PER_NICHE', '1');
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.nexscope.ai/api/skill-api/v1/skills/tiktok-product-discovery/run');
      expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${SECRETS.NEXSCOPE_API_KEY}`);
      bodies.push(JSON.parse(String(init?.body)));
      return jsonResponse(nexscopeFixture);
    });
    const provider = new NexscopeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep });
    const found = await provider.fetchTrendingProducts({ country: 'FR', date: '2026-11-12', category: 'beaute' });
    expect(bodies).toEqual([{ region: 'FR', category: 'Beauty & Personal Care', orderField: 'day7_units_sold', page: 1, pageSize: 10 }]);
    expect(found.map((p) => p.id)).toEqual(['nx-1731000000000000001', 'nx-1731000000000000002']);
  });
});

describe('Tâche nocturne avec une source réelle', () => {
  const base: ProviderProduct = {
    id: 'tts-1',
    name: 'Produit réel',
    niche: 'beaute',
    description: '',
    shop_name: '',
    price_cents: 2490,
    commission_rate: 0.15,
    free_sample: null,
    active_affiliates: null,
    image_url: '',
    estimated_sales: null,
    units_sold_total: 1000,
    sales_windows: null,
  };
  const fakeProvider = (products: ProviderProduct[]): ProductDataProvider => ({
    name: 'tiktok',
    fetchTrendingProducts: async () => products,
    fetchProductHistory: async () => [],
    fetchTopVideos: async () => [],
  });

  it('premier relevé : ventes inconnues, croissance non mesurable, critères manquants écartés', async () => {
    const repo = new LocalRepo(null);
    await refreshCatalog({ repo, date: '2026-11-10', provider: fakeProvider([base]) });
    const product = (await repo.getProduct('tts-1'))!;
    expect(product.active_affiliates).toBeNull();
    expect(product.free_sample).toBeNull();
    expect(product.sales_30d).toEqual([]);
    expect(product.latest_breakdown?.growth_7d).toBeNull();
    const unavailable = product.latest_breakdown!.parts.filter((p) => p.available === false).map((p) => p.key);
    expect(unavailable.sort()).toEqual(['croissance', 'echantillon', 'saturation']);
    // Le poids des critères manquants est réparti : commission et prix se partagent les 100 points.
    const applied = product.latest_breakdown!.parts.reduce((sum, p) => sum + (p.applied_weight ?? 0), 0);
    expect(applied).toBeCloseTo(100, 0);

    // Nuit suivante : les ventes du jour sont la différence des cumuls.
    await refreshCatalog({ repo, date: '2026-11-11', provider: fakeProvider([{ ...base, units_sold_total: 1120 }]) });
    const [, second] = await repo.getProductSnapshots('tts-1', 5);
    expect(second.estimated_sales).toBe(120);
    expect(second.units_sold_total).toBe(1120);
  });

  it('utilise les cumuls de la source tant que l’historique est trop court', async () => {
    const repo = new LocalRepo(null);
    await refreshCatalog({
      repo,
      date: '2026-11-10',
      provider: fakeProvider([{ ...base, id: 'nx-1', estimated_sales: 300, active_affiliates: 40, sales_windows: { last7: 2100, prev7: 1000 } }]),
    });
    const product = (await repo.getProduct('nx-1'))!;
    expect(product.latest_breakdown?.growth_7d).toBeCloseTo(1.1, 3);
    expect(product.trend).toBe('explose');
    expect(product.latest_breakdown!.parts.find((p) => p.key === 'saturation')?.available).toBe(true);
  });

  it('refuse une source réelle qui ne renvoie aucun produit (la nuit bascule alors en repli)', async () => {
    await expect(refreshCatalog({ repo: new LocalRepo(null), date: '2026-11-10', provider: fakeProvider([]) })).rejects.toThrow(
      'aucun produit vendu en France',
    );
  });
});

describe('Catalogue montré : jamais de fictif présenté comme réel', () => {
  async function mockProducts(date: string): Promise<Product[]> {
    const repo = new LocalRepo(null);
    await refreshCatalog({ repo, date, provider: new MockProvider() });
    return repo.listProducts();
  }
  const real = (date: string, updatedAt: string): Product => ({
    id: 'tts-9',
    provider: 'tiktok',
    name: 'Réel',
    niche: 'beaute',
    description: '',
    shop_name: '',
    price_cents: 1500,
    commission_rate: 0.1,
    free_sample: null,
    active_affiliates: null,
    image_url: '',
    top_videos: [],
    snapshot_date: date,
    latest_score: 50,
    latest_breakdown: null,
    trend: 'stable',
    growth_7d: 0,
    sales_30d: [],
    updated_at: updatedAt,
  });

  it('montre les produits fictifs avec la mention « démonstration » quand il n’y a rien de réel', async () => {
    const live = selectLiveCatalog(await mockProducts('2026-11-12'), new Date('2026-11-12T08:00:00Z'));
    expect(live.demo).toBe(true);
    expect(live.products.length).toBeGreaterThan(100);
  });

  it('préfère toujours le réel, même plus ancien que le repli fictif de la nuit', async () => {
    const all = [...(await mockProducts('2026-11-12')), real('2026-11-11', '2026-11-11T03:10:00Z')];
    const live = selectLiveCatalog(all, new Date('2026-11-12T08:00:00Z'));
    expect(live).toMatchObject({ demo: false, provider: 'tiktok', dataDate: '2026-11-11', stale: false });
    expect(live.products.map((p) => p.id)).toEqual(['tts-9']);
  });

  it('signale des données de plus de 36 heures', () => {
    const live = selectLiveCatalog([real('2026-11-10', '2026-11-10T03:10:00Z')], new Date('2026-11-11T16:00:00Z'));
    expect(live.stale).toBe(true);
    expect(selectLiveCatalog([real('2026-11-11', '2026-11-11T03:10:00Z')], new Date('2026-11-12T14:00:00Z')).stale).toBe(false);
  });
});

describe('Repli de la tâche nocturne', () => {
  it('bascule sur les données fictives si la source réelle échoue, et l’écrit dans l’historique', async () => {
    vi.stubEnv('DATA_PROVIDER', 'nexscope');
    vi.stubEnv('NEXSCOPE_API_KEY', SECRETS.NEXSCOPE_API_KEY);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ code: 11209, msg: 'invalid key' }, 401)));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { runNightly } = await import('@/lib/jobs/nightly');
      const repo = new LocalRepo(null);
      const result = await runNightly({ repo, date: '2026-11-12', trigger: 'manuel' });
      expect(result.refresh.provider).toBe('mock');
      expect(result.fallbacks).toEqual([{ provider: 'nexscope', error: expect.stringContaining('clé d’API refusée') }]);
      const [run] = await repo.listCronRuns(1);
      expect(run.status).toBe('ok');
      expect(run.details.repli).toEqual(result.fallbacks);
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('fournisseur « nexscope » en échec'));
      // Le message journalisé ne contient jamais la clé.
      for (const call of errors.mock.calls) expect(String(call[0])).not.toContain(SECRETS.NEXSCOPE_API_KEY);
      // Rien de réel en base : le radar montrera les produits fictifs, signalés comme tels.
      expect(selectLiveCatalog(await repo.listProducts()).demo).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});
