import { describe, expect, it } from 'vitest';
import {
  EXPLOSE_MIN_DAILY_SALES,
  SCALE,
  commissionPerSale,
  commissionValue,
  computeGrowth,
  dailyScale,
  growthFor,
  percentileRank,
  priceValue,
  saturationValue,
  scoreOne,
  scoreProducts,
  trendFor,
  WEIGHTS,
  type ScoreInput,
} from '@/lib/score';

const flat = (n: number, days = 14) => Array.from({ length: days }, () => n);
const rising = (from: number, to: number) => [...flat(from, 7), ...flat(to, 7)];

function product(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    id: 'p',
    niche: 'beaute',
    price_cents: 2490,
    commission_rate: 0.15, 
    affiliates: 50,
    sales: rising(100, 150),
    ...overrides,
  };
}

describe('poids', () => {
  it('gardent 35/25/20/10 sans l’échantillon (retiré), réparti au prorata sur 100', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(90);
    const applied = scoreOne(product({}), 0.5).parts.reduce((sum, p) => sum + (p.applied_weight ?? 0), 0);
    expect(Math.round(applied)).toBe(100);
    expect(WEIGHTS).toEqual({ croissance: 35, commission: 25, saturation: 20, prix: 10 });
  });
});

describe('croissance sur 7 jours', () => {
  it('compare les 7 derniers jours aux 7 précédents', () => {
    const g = computeGrowth(rising(100, 150));
    expect(g.last7).toBe(1050);
    expect(g.prev7).toBe(700);
    expect(g.growth7d).toBeCloseTo(0.5);
    expect(g.dailyAvg7).toBe(150);
  });

  it('gère un démarrage à zéro et borne les extrêmes', () => {
    expect(computeGrowth(rising(0, 10)).growth7d).toBe(1);
    expect(computeGrowth(rising(1, 500)).growth7d).toBe(5);
    expect(computeGrowth(flat(0)).growth7d).toBe(0);
  });

  it('classe la tendance (seuils recalibrés : +40 %, +10 %, −20 %)', () => {
    expect(trendFor(0.8)).toBe('explose');
    expect(trendFor(0.4)).toBe('explose');
    expect(trendFor(0.39)).toBe('monte');
    expect(trendFor(0.1)).toBe('monte');
    expect(trendFor(0.09)).toBe('stable');
    expect(trendFor(-0.19)).toBe('stable');
    expect(trendFor(-0.2)).toBe('baisse');
    expect(trendFor(-0.3)).toBe('baisse');
  });

  it('« explose » demande un vrai volume, et une croissance inconnue reste neutre', () => {
    expect(trendFor(1.5, EXPLOSE_MIN_DAILY_SALES - 1)).toBe('monte');
    expect(trendFor(1.5, EXPLOSE_MIN_DAILY_SALES)).toBe('explose');
    expect(trendFor(null)).toBe('stable');
  });

  it('mesure la croissance avec ce qu’on a : historique, sinon cumuls de la source, sinon rien', () => {
    expect(growthFor({ sales: flat(10, 5) })).toBeNull();
    expect(growthFor({ sales: flat(10, 5), windows: { last7: 700, prev7: 500 } })!.growth7d).toBeCloseTo(0.4);
    // Produit arrivé cette semaine : aucune vente avant, pas de « +100 % » sans base de comparaison.
    expect(growthFor({ sales: [], windows: { last7: 257, prev7: 0 } })).toBeNull();
    // 10 jours : 7 derniers comparés à la moyenne des 3 précédents.
    const partial = growthFor({ sales: [...flat(10, 3), ...flat(20, 7)] })!;
    expect(partial.growth7d).toBeCloseTo(1);
    expect(partial.dailyAvg7).toBe(20);
  });
});

describe('affichage de la croissance', () => {
  it('ne prétend pas à la précision au plafond', async () => {
    const { formatGrowth } = await import('@/lib/utils');
    expect(formatGrowth(0.42)).toBe('+42 %');
    expect(formatGrowth(-0.3)).toBe('−30 %');
    expect(formatGrowth(5)).toBe('+500 % et plus');
  });
});

describe('percentile', () => {
  it('place la valeur dans la population', () => {
    const pop = [0, 0.1, 0.2, 0.3, 0.4];
    expect(percentileRank(pop, 0.4)).toBe(1);
    expect(percentileRank(pop, 0)).toBe(0);
    expect(percentileRank(pop, 0.2)).toBe(0.5);
    expect(percentileRank([0.3], 0.3)).toBe(0.5);
  });
});

describe('composantes', () => {
  it('commission : 5 % = 0, 30 % = 1', () => {
    expect(commissionValue(0.05)).toBe(0);
    expect(commissionValue(0.3)).toBe(1);
    expect(commissionValue(0.175)).toBeCloseTo(0.5);
    expect(commissionValue(0.5)).toBe(1);
  });

  it('saturation : peu d’affiliés par vente = bon', () => {
    expect(saturationValue(10, 200)).toBe(1);
    expect(saturationValue(100, 100)).toBeCloseTo(0.5);
    expect(saturationValue(2000, 100)).toBe(0);
  });

  it('prix : zone 15–60 € pleine, dégressif autour', () => {
    expect(priceValue(1500)).toBe(1);
    expect(priceValue(6000)).toBe(1);
    expect(priceValue(800)).toBe(0);
    expect(priceValue(12000)).toBe(0);
    expect(priceValue(9000)).toBeCloseTo(0.5);
  });

  it('commission par vente en centimes', () => {
    expect(commissionPerSale(2990, 0.2)).toBe(598);
  });
});

describe('score complet', () => {
  it('donne 100 au produit parfait et 0 au pire', () => {
    const best = scoreOne(
      product({ commission_rate: 0.3,  affiliates: 5, sales: rising(100, 400), price_cents: 2990 }),
      1,
    );
    expect(best.total).toBe(100);
    const worst = scoreOne(
      product({ commission_rate: 0.05,  affiliates: 5000, sales: rising(100, 50), price_cents: 500 }),
      0,
    );
    expect(worst.total).toBe(0);
  });

  it('plafonne la croissance d’un produit en baisse', () => {
    const declining = scoreOne(product({ sales: rising(100, 60) }), 1);
    const part = declining.parts.find((p) => p.key === 'croissance')!;
    // Plafond : la moitié des points de croissance (poids 35 sur 90, ramené à 38,9 sur 100).
    expect(part.points).toBeLessThanOrEqual(19.5);
  });

  it('explique chaque composante en phrase', () => {
    const b = scoreOne(product({}), 0.9);
    expect(b.parts).toHaveLength(4);
    for (const part of b.parts) expect(part.sentence.length).toBeGreaterThan(20);
    expect(b.parts.find((p) => p.key === 'commission')!.sentence).toMatch(/3,74/);
    expect(b.summary.length).toBeGreaterThan(10);
  });

  it('la somme des points correspond au total des points', () => {
    const b = scoreOne(product(), 0.6);
    const sum = b.parts.reduce((acc, p) => acc + p.points, 0);
    expect(Math.abs(sum - b.raw!)).toBeLessThanOrEqual(1);
    expect(b.total).toBe(b.raw);
  });

  it('classe la croissance par niche', () => {
    const scores = scoreProducts([
      product({ id: 'a', niche: 'beaute', sales: rising(100, 300) }),
      product({ id: 'b', niche: 'beaute', sales: rising(100, 110) }),
      product({ id: 'c', niche: 'tech', sales: rising(100, 120) }),
    ]);
    const growth = (id: string) => scores.get(id)!.parts.find((p) => p.key === 'croissance')!.value;
    expect(growth('a')).toBe(1);
    expect(growth('b')).toBe(0);
    // Seul dans sa niche : au milieu.
    expect(growth('c')).toBe(0.5);
  });

  it('reste entre 0 et 100 sur des entrées aléatoires', () => {
    for (let i = 0; i < 200; i++) {
      const b = scoreOne(
        product({
          commission_rate: Math.random() * 0.4,
          affiliates: Math.floor(Math.random() * 5000),
          price_cents: 500 + Math.floor(Math.random() * 15000),
          sales: Array.from({ length: 14 }, () => Math.floor(Math.random() * 1000)), 
        }),
        Math.random(),
      );
      expect(b.total).toBeGreaterThanOrEqual(0);
      expect(b.total).toBeLessThanOrEqual(100);
    }
  });
});

describe('critères non fournis par la source', () => {
  it('ignore le critère et répartit son poids au prorata', () => {
    const b = scoreOne(product({ affiliates: null }), 0.8);
    const unavailable = b.parts.filter((p) => p.available === false).map((p) => p.key);
    expect(unavailable.sort()).toEqual(['saturation']);
    const applied = Object.fromEntries(b.parts.map((p) => [p.key, p.applied_weight]));
    // 35 + 25 + 10 = 70 points disponibles, ramenés à 100.
    expect(applied).toEqual({ croissance: 50, commission: 35.7, saturation: 0, prix: 14.3 });
    for (const part of b.parts.filter((p) => p.available === false)) {
      expect(part.points).toBe(0);
      expect(part.sentence).toMatch(/réparti sur les autres critères/);
    }
    const sum = b.parts.reduce((acc, p) => acc + p.points, 0);
    expect(Math.abs(sum - b.raw!)).toBeLessThanOrEqual(1);
  });

  it('sans historique ni cumuls : la croissance attend, le reste compte', () => {
    const b = scoreOne(product({ sales: [], affiliates: null }), 0);
    expect(b.growth_7d).toBeNull();
    expect(b.daily_sales_7d).toBeNull();
    expect(b.parts.find((p) => p.key === 'croissance')!.sentence).toMatch(/pas encore mesurable/);
    expect(b.parts.filter((p) => p.available).map((p) => p.key)).toEqual(['commission', 'prix']);
  });
});

describe('échelle du jour (15 à 90)', () => {
  const randomInputs = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      product({
        id: `p${i}`,
        niche: i % 2 ? 'beaute' : 'maison',
        commission_rate: 0.05 + ((i * 7) % 26) / 100,
        affiliates: (i * 37) % 900,
        price_cents: 600 + ((i * 1234) % 9000),
        sales: Array.from({ length: 14 }, (_, d) => 20 + ((i * 13 + d * (i % 5)) % 200)), 
      }),
    );

  it('étale les scores du jour entre 15 et 90, sans changer l’ordre', () => {
    const scores = [...scoreProducts(randomInputs(120)).values()];
    const totals = scores.map((b) => b.total);
    expect(Math.min(...totals)).toBe(SCALE.min);
    expect(Math.max(...totals)).toBe(SCALE.max);
    const byRaw = [...scores].sort((a, b) => a.raw! - b.raw!);
    for (let i = 1; i < byRaw.length; i++) expect(byRaw[i].total).toBeGreaterThanOrEqual(byRaw[i - 1].total);
  });

  it('garde une échelle fixe sur un petit catalogue ou des points trop resserrés', () => {
    expect(dailyScale([10, 50, 90])(100)).toBe(90);
    expect(dailyScale([10, 50, 90])(0)).toBe(15);
    expect(dailyScale([10, 50, 90])(50)).toBe(53);
    const tight = Array.from({ length: 30 }, (_, i) => 50 + (i % 5));
    expect(dailyScale(tight)(52)).toBe(Math.round(15 + 0.75 * 52));
  });
});
