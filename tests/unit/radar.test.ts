import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { applyFilters, canAccessProduct, getRadar, parseFilters, toProductView } from '@/lib/radar';
import { parisDate } from '@/lib/utils';

const repo = new LocalRepo(null);

beforeAll(async () => {
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: parisDate() });
});
afterAll(() => setRepoForTests(null));

async function user(plan: 'free' | 'pro') {
  const id = `u-${plan}`;
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  return repo.updateProfile(id, { niches: ['beaute'], plan, onboarded_at: new Date().toISOString() });
}

describe('radar et limites du plan', () => {
  it('le gratuit voit 3 produits, sans score, et les autres sont vides de données', async () => {
    const profile = await user('free');
    const radar = await getRadar(profile, {});
    expect(radar.visibleCount).toBe(3);
    expect(radar.lockedCount).toBe(radar.totalToday - 3);
    for (const item of radar.items) {
      if (item.kind === 'visible') {
        expect(item.product.score).toBeNull();
        expect(item.product.breakdown?.parts.every((p) => p.points === null)).toBe(true);
      } else {
        expect(Object.keys(item).sort()).toEqual(['key', 'kind', 'niche', 'rank']);
        expect(JSON.stringify(item)).not.toMatch(/fr-beaute/);
      }
    }
  });

  it('les filtres ne débloquent pas d’autres produits en gratuit', async () => {
    const profile = await user('free');
    const all = await getRadar(profile, {});
    const visibleIds = all.items.flatMap((i) => (i.kind === 'visible' ? [i.product.id] : []));
    const filtered = await getRadar(profile, parseFilters({ prix: 'plus60' }));
    for (const item of filtered.items) if (item.kind === 'visible') expect(visibleIds).toContain(item.product.id);
  });

  it('le Pro voit tout avec le score', async () => {
    const profile = await user('pro');
    const radar = await getRadar(profile, {});
    expect(radar.lockedCount).toBe(0);
    const first = radar.items[0];
    expect(first.kind === 'visible' && first.product.score).toBeGreaterThan(0);
  });

  it('un gratuit ne peut pas ouvrir une fiche hors de ses 3 produits', async () => {
    const free = await user('free');
    const radar = await getRadar(free, {});
    const visible = radar.items.find((i) => i.kind === 'visible');
    const products = await repo.listProducts({ niches: ['beaute'] });
    const hidden = products[10];
    expect(visible && visible.kind === 'visible' && (await canAccessProduct(free, visible.product.id))).toBe(true);
    expect(await canAccessProduct(free, hidden.id)).toBe(false);
    await repo.saveProduct(free.id, hidden.id);
    expect(await canAccessProduct(free, hidden.id)).toBe(true);
    expect(await canAccessProduct(await user('pro'), hidden.id)).toBe(true);
  });

  it('filtre par prix, commission, échantillon et tendance', async () => {
    const products = await repo.listProducts();
    const result = applyFilters(products, parseFilters({ prix: '15-30', commission: '20', echantillon: '1' }));
    for (const p of result) {
      expect(p.price_cents).toBeGreaterThanOrEqual(1500);
      expect(p.price_cents).toBeLessThanOrEqual(3000);
      expect(p.commission_rate).toBeGreaterThanOrEqual(0.2);
      expect(p.free_sample).toBe(true);
    }
    expect(parseFilters({ prix: 'n-importe', commission: '7', tendance: 'baisse' })).toEqual({});
    const view = toProductView(products[0], 'free');
    expect(view.score).toBeNull();
  });
});
