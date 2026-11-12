import type { ScoreBreakdown, ScorePart, Trend } from '@/lib/db/types';
import { nicheShort, type NicheId } from '@/lib/niches';
import { clamp, formatEuros, formatGrowth, formatInt } from '@/lib/utils';

/**
 * Score d'opportunité (0 à 100) :
 *  - 35 % croissance des ventes sur 7 jours, en percentile dans la niche
 *  - 25 % taux de commission
 *  - 20 % faible saturation (peu d'affiliés par rapport aux ventes)
 *  - 10 % prix dans la zone 15 à 60 €
 *  - 10 % échantillon gratuit disponible
 * Le détail est toujours expliqué en phrases simples.
 */

export const WEIGHTS = {
  croissance: 35,
  commission: 25,
  saturation: 20,
  prix: 10,
  echantillon: 10,
} as const;

export const COMMISSION_FLOOR = 0.05;
export const COMMISSION_CEIL = 0.3;
export const PRICE_ZONE = { min: 15, max: 60 } as const;

export interface ScoreInput {
  id: string;
  niche: NicheId;
  price_cents: number;
  commission_rate: number;
  free_sample: boolean;
  affiliates: number;
  /** Ventes quotidiennes, du plus ancien au plus récent (14 jours minimum conseillés). */
  sales: number[];
}

export interface GrowthStats {
  last7: number;
  prev7: number;
  growth7d: number; // 0.42 = +42 %
  dailyAvg7: number;
}

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

/** Croissance des 7 derniers jours par rapport aux 7 précédents. */
export function computeGrowth(sales: number[]): GrowthStats {
  const last = sales.slice(-7);
  const prev = sales.slice(-14, -7);
  const last7 = sum(last);
  const prev7 = sum(prev);
  const dailyAvg7 = last.length ? last7 / last.length : 0;
  let growth7d: number;
  if (prev.length === 0 || prev7 === 0) growth7d = last7 > 0 ? 1 : 0;
  else growth7d = last7 / prev7 - 1;
  // Évite les valeurs extrêmes sur des volumes minuscules.
  growth7d = clamp(growth7d, -1, 5);
  return { last7, prev7, growth7d, dailyAvg7 };
}

/** Rang centile (0..1) de `value` dans `population` (égalités comptées pour moitié). */
export function percentileRank(population: number[], value: number): number {
  if (population.length <= 1) return 0.5;
  let below = 0;
  let equal = 0;
  for (const v of population) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return clamp((below + 0.5 * Math.max(0, equal - 1)) / (population.length - 1));
}

export function trendFor(growth7d: number): Trend {
  if (growth7d >= 0.5) return 'explose';
  if (growth7d >= 0.12) return 'monte';
  if (growth7d > -0.15) return 'stable';
  return 'baisse';
}

export const TREND_LABELS: Record<Trend, string> = {
  explose: 'Explose',
  monte: 'Monte',
  stable: 'Stable',
  baisse: 'Baisse',
};

export function commissionValue(rate: number): number {
  return clamp((rate - COMMISSION_FLOOR) / (COMMISSION_CEIL - COMMISSION_FLOOR));
}

/** Affiliés par vente quotidienne : ≤ 0,1 = très peu de concurrence, ≥ 10 = saturé (échelle log). */
export function saturationValue(affiliates: number, dailySales: number): number {
  const ratio = Math.max(0.001, affiliates) / Math.max(1, dailySales);
  return clamp(1 - Math.log10(ratio / 0.1) / 2);
}

export function priceValue(priceCents: number): number {
  const price = priceCents / 100;
  if (price >= PRICE_ZONE.min && price <= PRICE_ZONE.max) return 1;
  if (price < PRICE_ZONE.min) return clamp((price - 8) / (PRICE_ZONE.min - 8));
  return clamp(1 - (price - PRICE_ZONE.max) / 60);
}

/** Commission estimée par vente, en centimes. */
export function commissionPerSale(priceCents: number, rate: number): number {
  return Math.round(priceCents * rate);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function growthSentence(stats: GrowthStats, pct: number, niche: NicheId): string {
  const better = Math.round(pct * 100);
  const nicheName = nicheShort(niche).toLowerCase();
  if (stats.growth7d >= 0.05) {
    return `Ventes en hausse de ${formatGrowth(stats.growth7d).replace('+', '')} sur 7 jours : ça progresse mieux que ${better} % des produits ${nicheName}.`;
  }
  if (stats.growth7d > -0.05) {
    return `Ventes stables sur 7 jours (${formatGrowth(stats.growth7d)}). Pas d'emballement pour l'instant.`;
  }
  return `Ventes en baisse de ${formatGrowth(stats.growth7d).replace('−', '')} sur 7 jours : la vague retombe.`;
}

function commissionSentence(rate: number, priceCents: number): string {
  const pct = Math.round(rate * 100);
  const perSale = formatEuros(commissionPerSale(priceCents, rate));
  if (rate >= 0.2) return `Commission de ${pct} % : environ ${perSale} pour toi à chaque vente. C'est généreux.`;
  if (rate <= 0.08) return `Commission de ${pct} % : environ ${perSale} par vente. C'est peu, il faudra du volume.`;
  return `Commission de ${pct} % : environ ${perSale} pour toi à chaque vente.`;
}

function saturationSentence(value: number, affiliates: number, dailySales: number): string {
  const a = formatInt(affiliates);
  const s = formatInt(Math.round(dailySales));
  if (value >= 0.65) return `Peu d'affiliés dessus : ${a} pour environ ${s} ventes par jour. Il reste de la place.`;
  if (value >= 0.35) return `Concurrence moyenne : ${a} affiliés pour environ ${s} ventes par jour.`;
  return `Beaucoup d'affiliés dessus : ${a} pour environ ${s} ventes par jour. Il faudra te démarquer.`;
}

function priceSentence(priceCents: number): string {
  const price = formatEuros(priceCents);
  const euros = priceCents / 100;
  if (euros >= PRICE_ZONE.min && euros <= PRICE_ZONE.max) {
    return `Prix de ${price} : dans la zone de 15 à 60 € où l'on achète sans trop hésiter.`;
  }
  if (euros < PRICE_ZONE.min) return `Prix de ${price} : sous 15 €, chaque vente rapporte peu.`;
  return `Prix de ${price} : au-dessus de 60 €, l'achat demande plus de conviction.`;
}

function sampleSentence(freeSample: boolean): string {
  return freeSample
    ? 'Échantillon gratuit disponible : tu peux le recevoir et le tester avant de filmer.'
    : "Pas d'échantillon gratuit pour l'instant : il faudra acheter le produit pour le filmer.";
}

const PART_LABELS: Record<ScorePart['key'], string> = {
  croissance: 'Croissance',
  commission: 'Commission',
  saturation: 'Concurrence',
  prix: 'Prix',
  echantillon: 'Échantillon',
};

function summarize(parts: ScorePart[]): string {
  const ratio = (p: ScorePart) => p.points / p.weight;
  const strong = parts.filter((p) => ratio(p) >= 0.7).sort((a, b) => b.points - a.points);
  const weak = parts.filter((p) => ratio(p) < 0.35).sort((a, b) => b.weight - a.weight);
  const list = (items: ScorePart[]) =>
    items
      .slice(0, 2)
      .map((p) => PART_LABELS[p.key].toLowerCase())
      .join(' et ');
  if (strong.length && weak.length) return `Ce qui fait monter le score : ${list(strong)}. Ce qui le freine : ${list(weak)}.`;
  if (strong.length) return `Ce qui fait monter le score : ${list(strong)}.`;
  if (weak.length) return `Ce qui freine le score : ${list(weak)}.`;
  return 'Un produit équilibré, sans point fort ni point faible marqué.';
}

/** Calcule le détail du score pour un produit, connaissant le centile de sa croissance. */
export function scoreOne(input: ScoreInput, growthPercentile: number, stats = computeGrowth(input.sales)): ScoreBreakdown {
  // Un produit en baisse ne peut pas prendre tous les points de croissance, même s'il est le
  // « moins pire » de sa niche.
  const growthValue = stats.growth7d < 0 ? Math.min(growthPercentile, 0.5) : growthPercentile;
  const values: Record<ScorePart['key'], number> = {
    croissance: growthValue,
    commission: commissionValue(input.commission_rate),
    saturation: saturationValue(input.affiliates, stats.dailyAvg7),
    prix: priceValue(input.price_cents),
    echantillon: input.free_sample ? 1 : 0,
  };
  const sentences: Record<ScorePart['key'], string> = {
    croissance: growthSentence(stats, growthPercentile, input.niche),
    commission: commissionSentence(input.commission_rate, input.price_cents),
    saturation: saturationSentence(values.saturation, input.affiliates, stats.dailyAvg7),
    prix: priceSentence(input.price_cents),
    echantillon: sampleSentence(input.free_sample),
  };
  const parts: ScorePart[] = (Object.keys(WEIGHTS) as Array<ScorePart['key']>).map((key) => ({
    key,
    label: PART_LABELS[key],
    weight: WEIGHTS[key],
    value: round1(values[key] * 100) / 100,
    points: round1(values[key] * WEIGHTS[key]),
    sentence: sentences[key],
  }));
  const total = Math.round(clamp(sum(parts.map((p) => values[p.key] * p.weight)), 0, 100));
  return {
    total,
    parts,
    growth_7d: Math.round(stats.growth7d * 1000) / 1000,
    daily_sales_7d: Math.round(stats.dailyAvg7),
    summary: summarize(parts),
  };
}

/** Calcule les scores d'une liste de produits ; la croissance est classée par niche. */
export function scoreProducts(inputs: ScoreInput[]): Map<string, ScoreBreakdown> {
  const stats = new Map(inputs.map((i) => [i.id, computeGrowth(i.sales)]));
  const byNiche = new Map<NicheId, number[]>();
  for (const input of inputs) {
    const list = byNiche.get(input.niche) ?? [];
    list.push(stats.get(input.id)!.growth7d);
    byNiche.set(input.niche, list);
  }
  const result = new Map<string, ScoreBreakdown>();
  for (const input of inputs) {
    const s = stats.get(input.id)!;
    const pct = percentileRank(byNiche.get(input.niche)!, s.growth7d);
    result.set(input.id, scoreOne(input, pct, s));
  }
  return result;
}
