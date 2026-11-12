import { describe, expect, it } from 'vitest';
import {
  commissionPerSale,
  commissionValue,
  computeGrowth,
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
    free_sample: false,
    affiliates: 50,
    sales: rising(100, 150),
    ...overrides,
  };
}

describe('poids', () => {
  it('totalisent 100', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(WEIGHTS).toEqual({ croissance: 35, commission: 25, saturation: 20, prix: 10, echantillon: 10 });
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

  it('classe la tendance', () => {
    expect(trendFor(0.8)).toBe('explose');
    expect(trendFor(0.2)).toBe('monte');
    expect(trendFor(0)).toBe('stable');
    expect(trendFor(-0.3)).toBe('baisse');
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
      product({ commission_rate: 0.3, free_sample: true, affiliates: 5, sales: rising(100, 400), price_cents: 2990 }),
      1,
    );
    expect(best.total).toBe(100);
    const worst = scoreOne(
      product({ commission_rate: 0.05, free_sample: false, affiliates: 5000, sales: rising(100, 50), price_cents: 500 }),
      0,
    );
    expect(worst.total).toBe(0);
  });

  it('plafonne la croissance d’un produit en baisse', () => {
    const declining = scoreOne(product({ sales: rising(100, 60) }), 1);
    const part = declining.parts.find((p) => p.key === 'croissance')!;
    expect(part.points).toBeLessThanOrEqual(17.5);
  });

  it('explique chaque composante en phrase', () => {
    const b = scoreOne(product({ free_sample: true }), 0.9);
    expect(b.parts).toHaveLength(5);
    for (const part of b.parts) expect(part.sentence.length).toBeGreaterThan(20);
    expect(b.parts.find((p) => p.key === 'echantillon')!.sentence).toMatch(/Échantillon gratuit disponible/);
    expect(b.parts.find((p) => p.key === 'commission')!.sentence).toMatch(/3,74/);
    expect(b.summary.length).toBeGreaterThan(10);
  });

  it('la somme des points correspond au total', () => {
    const b = scoreOne(product(), 0.6);
    const sum = b.parts.reduce((acc, p) => acc + p.points, 0);
    expect(Math.abs(sum - b.total)).toBeLessThanOrEqual(1);
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
          free_sample: Math.random() > 0.5,
        }),
        Math.random(),
      );
      expect(b.total).toBeGreaterThanOrEqual(0);
      expect(b.total).toBeLessThanOrEqual(100);
    }
  });
});
