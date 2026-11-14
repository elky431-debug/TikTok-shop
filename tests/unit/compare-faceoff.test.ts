import { describe, expect, it } from 'vitest';
import { simpleVerdict } from '@/lib/ai/compare-verdict';
import { compareProducts, verdictKey, type ComparableProduct } from '@/lib/radar/compare';

const base = (over: Partial<ComparableProduct> & Pick<ComparableProduct, 'id' | 'name'>): ComparableProduct => ({
  score: 60,
  personal_score: null,
  price_cents: 2000,
  commission_rate: 0.15,
  commission_cents: 300,
  active_affiliates: null,
  growth_known: true,
  figures: { sales_7d: null, sales_30d: null, growth_7d: null, rating: null },
  ...over,
});

describe('comparateur face à face', () => {
  it('donne le gagnant de chaque ligne, sans gagnant en cas d’égalité, et les affiliés à l’envers', () => {
    const a = base({
      id: 'a',
      name: 'Sérum',
      score: 72,
      commission_cents: 450,
      active_affiliates: 40,
      figures: { sales_7d: 120, sales_30d: null, growth_7d: 0.3, rating: 4.6 },
    });
    const b = base({
      id: 'b',
      name: 'Brosse',
      score: 64,
      commission_cents: 450,
      active_affiliates: 10,
      figures: { sales_7d: 300, sales_30d: null, growth_7d: -0.1, rating: null },
    });
    const c = compareProducts([a, b]);
    const row = (id: string) => c.rows.find((r) => r.id === id)!;
    expect(row('score').winners).toEqual([0]);
    expect(row('per_sale').winners).toEqual([]); // égalité
    expect(row('affiliates').winners).toEqual([1]); // moins de concurrence
    expect(row('affiliates').bars[1]).toBe(1);
    expect(row('sales_7d').winners).toEqual([1]);
    expect(row('rating').winners).toEqual([]); // une seule valeur connue
    expect(c.rows.some((r) => r.id === 'sales_30d')).toBe(false); // personne ne l'a
    expect(c.rows.some((r) => r.id === 'personal')).toBe(false);
    expect(row('growth').bars[0]).toBe(1);
    expect(c.wins).toEqual([2, 2]); // égalité : le score départage
    expect(c.winner).toBe(0);
  });

  it('à égalité de lignes gagnées, le score départage', () => {
    const a = base({ id: 'a', name: 'A', score: 50, commission_cents: 500 });
    const b = base({ id: 'b', name: 'B', score: 70, commission_cents: 100 });
    const c = compareProducts([a, b]);
    expect(c.wins).toEqual([1, 1]);
    expect(c.winner).toBe(1);
  });

  it('verdict simple sans IA, et cache par groupe de produits quel que soit l’ordre', () => {
    const a = base({ id: 'a', name: 'Sérum', score: 80, commission_cents: 500 });
    const b = base({ id: 'b', name: 'Brosse', score: 60, commission_cents: 200 });
    const sentence = simpleVerdict([a, b], compareProducts([a, b]));
    expect(sentence).toMatch(/^Pars sur Sérum : il l’emporte sur 2 critères sur 2/);
    expect(sentence).not.toMatch(/meilleur/i);
    expect(verdictKey(['b', 'a'], '2026-11-14')).toBe(verdictKey(['a', 'b'], '2026-11-14'));
  });
});
