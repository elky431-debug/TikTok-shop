import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductDataProvider, ProviderProduct } from '@/lib/data/provider';
import { LocalRepo } from '@/lib/db/local';
import type { ProductDetails, TopVideo } from '@/lib/db/types';
import { refreshCatalog, videosAreFresh } from '@/lib/jobs/refresh';

/**
 * Coûts maîtrisés de la fiche produit avec une source payante : vidéos des N meilleurs produits seulement, jamais
 * redemandées pendant 3 jours ; ventes par période seulement pour les produits qui ont moins de 7 jours de relevés.
 */
function paidProvider(count: number) {
  const calls = { videos: [] as string[], details: [] as string[][] };
  const products: ProviderProduct[] = Array.from({ length: count }, (_, i) => ({
    id: `nx-${i}`,
    name: `Produit ${i}`,
    niche: 'beaute',
    description: '',
    shop_name: '',
    price_cents: 2000 + i * 100,
    // Commission croissante : le produit 14 est le mieux noté.
    commission_rate: 0.05 + i * 0.015,
    active_affiliates: 10,
    image_url: '',
    estimated_sales: 100 + i,
  }));
  const provider: ProductDataProvider = {
    name: 'nexscope',
    fetchTrendingProducts: async () => products,
    fetchProductHistory: async () => [],
    fetchTopVideos: async (id: string): Promise<TopVideo[]> => {
      calls.videos.push(id);
      return [{ title: `Vidéo de ${id}`, views: 1000, estimated_sales: 10, hook: null, format: 'Vidéo' }];
    },
    fetchProductDetails: async (ids: string[]) => {
      calls.details.push(ids);
      return new Map<string, ProductDetails>(
        ids.map((id) => [id, { sales: { d1: 1, d7: 7, d15: 15, d30: 30, d60: 60, d90: 90 }, first_seen: '2026-08-01', rating: 4.5, review_count: 10, fetched_at: '' }]),
      );
    },
  };
  return { provider, calls };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('vidéos et ventes par période (source payante)', () => {
  it('charge les vidéos des N meilleurs produits, puis rien pendant 3 jours', async () => {
    vi.stubEnv('NEXSCOPE_MAX_VIDEO_CALLS_PER_NIGHT', '3');
    const repo = new LocalRepo(null);
    const { provider, calls } = paidProvider(15);
    vi.useFakeTimers({ now: new Date('2026-11-10T03:00:00Z'), toFake: ['Date'] });
    const first = await refreshCatalog({ repo, provider, date: '2026-11-10' });
    expect(first.videos).toBe(3);
    expect(calls.videos.sort()).toEqual(['nx-12', 'nx-13', 'nx-14']);
    expect((await repo.getProduct('nx-14'))?.top_videos[0].title).toBe('Vidéo de nx-14');
    expect((await repo.getProduct('nx-0'))?.top_videos).toEqual([]);

    calls.videos = [];
    vi.setSystemTime(new Date('2026-11-12T03:00:00Z'));
    await refreshCatalog({ repo, provider, date: '2026-11-12' });
    expect(calls.videos).toEqual([]);

    vi.setSystemTime(new Date('2026-11-13T04:00:00Z'));
    await refreshCatalog({ repo, provider, date: '2026-11-13' });
    expect(calls.videos.sort()).toEqual(['nx-12', 'nx-13', 'nx-14']);
  });

  it('lit les ventes par période en un seul appel, seulement pour les produits à l’historique court', async () => {
    const repo = new LocalRepo(null);
    const { provider, calls } = paidProvider(4);
    await refreshCatalog({ repo, provider, date: '2026-11-10' });
    expect(calls.details.map((ids) => [...ids].sort())).toEqual([['nx-0', 'nx-1', 'nx-2', 'nx-3']]);
    expect((await repo.getProduct('nx-2'))?.details?.sales.d7).toBe(7);

    // Après 7 nuits de relevés, la courbe jour par jour suffit : plus d'appel.
    for (let d = 11; d <= 17; d++) await refreshCatalog({ repo, provider, date: `2026-11-${d}` });
    calls.details = [];
    await refreshCatalog({ repo, provider, date: '2026-11-18' });
    expect(calls.details).toEqual([]);
    expect((await repo.getProduct('nx-2'))?.details?.sales.d7).toBe(7);
  });

  it('considère des vidéos fraîches pendant 3 jours', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    expect(videosAreFresh('2026-11-10T12:00:01Z', now)).toBe(true);
    expect(videosAreFresh('2026-11-09T11:59:59Z', now)).toBe(false);
    expect(videosAreFresh(null, now)).toBe(false);
  });
});

describe('vidéos dans le studio', () => {
  it('le prompt cite les vraies vidéos avec leurs chiffres, sans en inventer', async () => {
    const { describeVideo } = await import('@/lib/ai/prompt');
    const { formatInt } = await import('@/lib/utils');
    expect(describeVideo({ title: 'Ma routine du soir', views: 529386, estimated_sales: 53, hook: null, format: 'Vidéo', duration_s: 17 })).toBe(
      `« Ma routine du soir » (53 ventes estimées, ${formatInt(529386)} vues, 17 secondes)`,
    );
    expect(describeVideo({ title: 'Vidéo sans description', views: null, estimated_sales: null, hook: null, format: 'Vidéo' })).toBe('vidéo sans description');
  });
});
