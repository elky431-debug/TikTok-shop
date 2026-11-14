import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { labelResults, SEARCH_KIND, type KeywordResult, type SearchRecord } from '@/lib/radar/keyword-search';
import { ensureSearchProduct, productFromResult, scaleFromCatalog, searchScore } from '@/lib/radar/search-products';
import { makeProduct, makeUser } from './v2-fixtures';

let repo: LocalRepo;
beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});
afterEach(() => setRepoForTests(null));

const result = (over: Partial<KeywordResult> = {}): KeywordResult => ({
  id: 'nx-777',
  name: 'Ballon de football taille 5 – cousu main, entraînement et match, pour adultes et enfants',
  short_name: 'Ballon de foot taille 5',
  niche_checked: true,
  niche: 'sport',
  category: ['Sports & Outdoor', 'Ball Sports Equipment', 'Football'],
  shop_name: 'Boutique Sport',
  image_url: '',
  price_cents: 1990,
  price_min_cents: null,
  price_max_cents: null,
  commission_rate: 0.2,
  commission_cents: 398,
  sales_7d: 140,
  sales_month: 500,
  sales_month_days: 28,
  affiliates: 12,
  rating: 4.6,
  review_count: 80,
  ...over,
});

describe('recherche · fiche à la volée', () => {
  it('construit une fiche complète sans rien inventer, hors du radar', () => {
    const p = productFromResult(result(), { region: 'FR', scale: (raw) => raw });
    expect(p).toMatchObject({ id: 'nx-777', short_name: 'Ballon de foot taille 5', niche: 'sport', snapshot_date: null, sales_30d: [], trend: 'stable' });
    expect(p.description).toBe('Catégorie TikTok Shop : Sports & Outdoor › Ball Sports Equipment › Football');
    expect(p.details?.sales).toEqual({ d1: null, d7: 140, d15: null, d30: null, d60: null, d90: null }); // 28 jours ≠ 30 jours
    expect(p.details?.rating).toBe(4.6);
    // Croissance inconnue : son poids est réparti sur les critères connus.
    const croissance = p.latest_breakdown?.parts.find((part) => part.key === 'croissance');
    expect(croissance?.available).toBe(false);
    expect(p.latest_breakdown?.parts.find((part) => part.key === 'saturation')?.available).toBe(true);
    expect(p.latest_score).toBeGreaterThan(0);
  });

  it('place le score sur l’échelle du jour (15 à 90)', () => {
    const catalog = Array.from({ length: 30 }, (_, i) => ({ latest_score: 0, latest_breakdown: { raw: 20 + i * 2 } as never }));
    const score = searchScore(result(), scaleFromCatalog(catalog));
    expect(score).toBeGreaterThanOrEqual(15);
    expect(score).toBeLessThanOrEqual(90);
  });

  it('crée la fiche à partir de la recherche de la personne seulement, sans écraser un produit existant', async () => {
    const { id } = await makeUser(repo, 'u1', 'pro');
    const other = await makeUser(repo, 'u2', 'pro');
    await repo.saveRecord<SearchRecord>(id, SEARCH_KIND, { keyword: 'ballon', region: 'FR', source: 'nexscope', results: [result()], skipped: 0 });
    expect(await ensureSearchProduct(repo, { id: other.id, region: 'FR' }, 'nx-777', [])).toBeNull();
    const created = await ensureSearchProduct(repo, { id, region: 'FR' }, 'nx-777', []);
    expect(created?.short_name).toBe('Ballon de foot taille 5');
    expect(await repo.getProduct('nx-777')).not.toBeNull();
    // Hors du radar : listProducts ne rend que les produits relevés.
    expect((await repo.listProducts()).some((p) => p.id === 'nx-777')).toBe(false);
    // Un produit déjà en base n'est jamais remplacé par le résultat de recherche.
    await repo.upsertProducts([makeProduct({ id: 'nx-888', name: 'Produit du relevé', snapshot_date: '2026-11-14' })]);
    await repo.saveRecord<SearchRecord>(id, SEARCH_KIND, {
      keyword: 'x',
      region: 'FR',
      source: 'nexscope',
      results: [result({ id: 'nx-888', name: 'Autre titre' })],
      skipped: 0,
    });
    expect((await ensureSearchProduct(repo, { id, region: 'FR' }, 'nx-888', []))?.name).toBe('Produit du relevé');
  });

  it('reprend les noms courts déjà en base, et nomme les autres (règle simple sans IA)', async () => {
    await repo.upsertProducts([
      makeProduct({ id: 'nx-1', name: 'Titre long', short_name: 'Sérum éclat', niche: 'beaute', niche_checked: true, snapshot_date: '2026-11-14' }),
    ]);
    const rows = [
      result({ id: 'nx-1', short_name: undefined, niche: 'maison', niche_checked: false }),
      result({ id: 'nx-2', name: 'Gourde isotherme 750 ml – inox', short_name: undefined, niche_checked: false }),
    ];
    await labelResults(rows, repo);
    expect(rows[0]).toMatchObject({ short_name: 'Sérum éclat', niche: 'beaute', niche_checked: true });
    expect(rows[1].short_name).toBe('Gourde isotherme 750 ml');
  });
});

describe('recherche · source indisponible', () => {
  it('cherche alors dans le radar du jour, et le dit', async () => {
    const { searchKeyword } = await import('@/lib/radar/keyword-search');
    await repo.upsertProducts([makeProduct({ id: 'nx-9', name: 'Gourde isotherme inox 750 ml', short_name: 'Gourde isotherme', snapshot_date: '2026-11-14' })]);
    const failing = { searchProducts: async () => Promise.reject(new Error('crédits Nexscope épuisés (code 13011)')) };
    const found = await searchKeyword('gourde', 'FR', { repo, source: failing });
    expect(found.fallback).toBe(true);
    expect(found.source).toBe('catalogue');
  });
});
