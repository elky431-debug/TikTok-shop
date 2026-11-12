import { describe, expect, it } from 'vitest';
import { MockProvider } from '@/lib/data/mock';
import { LocalRepo } from '@/lib/db/local';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { prepareDigests } from '@/lib/digest/prepare';
import { NICHE_IDS } from '@/lib/niches';

const provider = new MockProvider();
const DATE = '2026-11-12';

describe('MockProvider', () => {
  it('génère environ 200 produits répartis dans les 7 niches', async () => {
    const products = await provider.fetchTrendingProducts({ country: 'FR', date: DATE });
    expect(products.length).toBe(200);
    for (const niche of NICHE_IDS) expect(products.some((p) => p.niche === niche)).toBe(true);
    for (const p of products) {
      expect(p.price_cents).toBeGreaterThanOrEqual(800);
      expect(p.price_cents).toBeLessThanOrEqual(12000);
      expect(p.commission_rate).toBeGreaterThanOrEqual(0.05);
      expect(p.commission_rate).toBeLessThanOrEqual(0.3);
      expect(p.image_url).toMatch(/^\/api\/produit-image\//);
    }
    expect(new Set(products.map((p) => p.id)).size).toBe(200);
  });

  it('est déterministe et cohérent d’un jour à l’autre', async () => {
    const a = await provider.fetchProductHistory('fr-beaute-001', 30, DATE);
    const b = await provider.fetchProductHistory('fr-beaute-001', 30, DATE);
    expect(a).toEqual(b);
    expect(a).toHaveLength(30);
    const yesterday = await provider.fetchProductHistory('fr-beaute-001', 29, '2026-11-11');
    expect(a.slice(0, 29)).toEqual(yesterday);
  });

  it('propose des vidéos de référence', async () => {
    const videos = await provider.fetchTopVideos('fr-tech-003');
    expect(videos.length).toBeGreaterThanOrEqual(3);
    expect(videos[0].estimated_sales!).toBeGreaterThanOrEqual(videos[videos.length - 1].estimated_sales!);
  });

  it('n’utilise aucune vraie marque connue', async () => {
    const products = await provider.fetchTrendingProducts({ country: 'FR', date: DATE });
    const forbidden = /\b(apple|samsung|dyson|l'or[eé]al|nivea|nike|adidas|garnier|philips|xiaomi|sephora)\b/i;
    for (const p of products) expect(p.name).not.toMatch(forbidden);
  });
});

describe('tâche nocturne', () => {
  it('enregistre produits, instantanés et scores, puis prépare les récaps', async () => {
    const repo = new LocalRepo(null);
    const result = await refreshCatalog({ date: DATE, repo, provider, backfillDays: 3 });
    expect(result.products).toBe(200);
    expect(result.snapshots).toBe(600);
    const products = await repo.listProducts();
    expect(products[0].latest_score).toBeGreaterThanOrEqual(products[1].latest_score);
    expect(products[0].latest_breakdown?.parts).toHaveLength(4);
    expect(products[0].sales_30d.length).toBe(30);
    expect(products[0].snapshot_date).toBe(DATE);
    const history = await repo.getProductSnapshots(products[0].id, 30);
    expect(history.map((h) => h.date)).toEqual(['2026-11-10', '2026-11-11', DATE]);

    const user = await repo.ensureProfile({ id: 'u1', email: 'u1@test.fr' });
    await repo.updateProfile(user.id, { niches: ['beaute'], onboarded_at: new Date().toISOString(), first_name: 'Léa' });
    const digests = await prepareDigests(DATE, repo);
    expect(digests.prepared).toBe(1);
    const digest = await repo.getDigest('u1', DATE);
    expect(digest?.content.products).toHaveLength(3); // plan gratuit
    expect(digest?.content.products.every((p) => p.niche === 'beaute')).toBe(true);
    expect(digest?.content.products[0].score).toBeNull(); // score masqué en gratuit
    expect(digest?.content.hook?.text.length).toBeGreaterThan(5);
    expect(digest?.content.locked_count).toBeGreaterThan(0);

    await repo.updateProfile('u1', { plan: 'pro' });
    await prepareDigests(DATE, repo);
    const pro = await repo.getDigest('u1', DATE);
    expect(pro?.content.products).toHaveLength(5);
    expect(pro?.content.products[0].score).toBeGreaterThan(0);
  });
});
