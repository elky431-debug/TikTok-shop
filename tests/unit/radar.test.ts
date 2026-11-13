import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { applyFilters, canAccessProduct, getRadar, parseFilters, toProductView } from '@/lib/radar';
import type { PlanId } from '@/lib/db/types';
import type { ScoreSet } from '@/lib/radar/personal';
import { parisDate } from '@/lib/utils';

const repo = new LocalRepo(null);

beforeAll(async () => {
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: parisDate() });
});
afterAll(() => setRepoForTests(null));

async function user(plan: PlanId) {
  const id = `u-${plan}`;
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  return repo.updateProfile(id, { niches: ['beaute'], plan, onboarded_at: new Date().toISOString() });
}

describe('radar et limites du plan', () => {
  it('sans abonnement : aucun produit en clair, les produits verrouillés sont vides de données', async () => {
    const profile = await user('aucun');
    const radar = await getRadar(profile, {});
    expect(radar.visibleCount).toBe(0);
    expect(radar.totalToday).toBeGreaterThan(0);
    expect(radar.lockedCount).toBe(radar.totalToday);
    for (const item of radar.items) {
      expect(item.kind).toBe('locked');
      expect(Object.keys(item).sort()).toEqual(['key', 'kind', 'niche', 'rank']);
      expect(JSON.stringify(item)).not.toMatch(/fr-beaute/);
    }
  });

  it('les filtres ne débloquent aucun produit sans abonnement', async () => {
    const profile = await user('aucun');
    for (const filters of [{}, parseFilters({ prix: 'plus60' }), parseFilters({ commission: '20' })]) {
      const radar = await getRadar(profile, filters);
      expect(radar.visibleCount).toBe(0);
      expect(radar.items.some((i) => i.kind === 'visible')).toBe(false);
    }
  });

  it('chaque plan payant (Starter compris) voit tout le radar, avec le score et ses points', async () => {
    for (const plan of ['starter', 'pro', 'elite'] as const) {
      const radar = await getRadar(await user(plan), {});
      expect(radar.lockedCount).toBe(0);
      expect(radar.visibleCount).toBe(radar.totalToday);
      const first = radar.items[0];
      expect(first.kind === 'visible' && first.product.score).toBeGreaterThan(0);
      expect(first.kind === 'visible' && first.product.breakdown?.parts.some((p) => p.points !== null)).toBe(true);
    }
  });

  it('sans abonnement, on n’ouvre aucune fiche, sauf un produit déjà suivi ; un abonné ouvre tout', async () => {
    const none = await user('aucun');
    const products = await repo.listProducts({ niches: ['beaute'] });
    const [top] = products;
    const hidden = products[10];
    expect(await canAccessProduct(none, top.id)).toBe(false);
    expect(await canAccessProduct(none, hidden.id)).toBe(false);
    await repo.saveProduct(none.id, hidden.id);
    expect(await canAccessProduct(none, hidden.id)).toBe(true);
    expect(await canAccessProduct(none, top.id)).toBe(false);
    for (const plan of ['starter', 'pro', 'elite'] as const) {
      expect(await canAccessProduct(await user(plan), hidden.id)).toBe(true);
      expect(await canAccessProduct(await user(plan), products.at(-1)!.id)).toBe(true);
    }
  });

  it('filtre par prix, commission et tendance', async () => {
    const products = await repo.listProducts();
    const result = applyFilters(products, parseFilters({ prix: '15-30', commission: '20' }));
    for (const p of result) {
      expect(p.price_cents).toBeGreaterThanOrEqual(1500);
      expect(p.price_cents).toBeLessThanOrEqual(3000);
      expect(p.commission_rate).toBeGreaterThanOrEqual(0.2);
    }
    expect(parseFilters({ prix: 'n-importe', commission: '7', tendance: 'baisse' })).toEqual({});
  });

  it('vue d’un produit : score retiré sans abonnement, score « pour toi » retiré en Starter (à partir de Pro)', async () => {
    const [product] = await repo.listProducts();
    const scores = { score: 77, personal: 64 } as ScoreSet;
    const none = toProductView(product, 'aucun', false, { scores });
    expect(none.score).toBeNull();
    expect(none.personal_score).toBeNull();
    expect(none.breakdown?.parts.every((p) => p.points === null)).toBe(true);
    expect(toProductView(product, 'starter', false, { scores })).toMatchObject({ score: 77, personal_score: null });
    expect(toProductView(product, 'pro', false, { scores })).toMatchObject({ score: 77, personal_score: 64 });
    expect(toProductView(product, 'elite', false, { scores })).toMatchObject({ score: 77, personal_score: 64 });
  });
});
