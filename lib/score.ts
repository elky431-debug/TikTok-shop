import type { ScoreBreakdown, ScorePart, Trend } from '@/lib/db/types';
import { nicheShort, type NicheId } from '@/lib/niches';
import { clamp, formatEuros, formatGrowth, formatInt } from '@/lib/utils';

/**
 * Score d'opportunité (0 à 100) :
 *  - 35 % croissance des ventes sur 7 jours, en percentile dans la niche
 *  - 25 % taux de commission
 *  - 20 % faible saturation (peu d'affiliés par rapport aux ventes)
 *  - 10 % prix dans la zone 15 à 60 €
 * Le critère « échantillon gratuit » (10 %) prévu au départ est retiré : aucune source ne le fournit (Nexscope n'a
 * aucun champ pour cela, l'API TikTok non plus). Comme pour tout critère absent, son poids est réparti au prorata :
 * 38,9 / 27,8 / 22,2 / 11,1. Le détail est toujours expliqué en phrases simples.
 */

export const WEIGHTS = {
  croissance: 35,
  commission: 25,
  saturation: 20,
  prix: 10,
} as const;

/**
 * Échelle affichée : chaque jour, les points (0 à 100) sont étalés entre 15 et 90, du produit le moins
 * intéressant au plus intéressant du catalogue (2e et 98e centiles), pour que le score reste lisible quelle que
 * soit la source de données ou les critères disponibles. Voir DECISIONS.md (étape 3 de la session 3).
 */
export const SCALE = { min: 15, max: 90 } as const;
export const SCALE_QUANTILES = { low: 0.02, high: 0.98 } as const;
/** En dessous, ou si les points du jour sont trop resserrés, échelle fixe : 15 + 0,75 × points. */
export const MIN_PRODUCTS_FOR_SCALING = 20;
export const MIN_SPREAD_FOR_SCALING = 10;

/** Seuils de tendance sur la croissance des ventes à 7 jours. */
export const TREND_THRESHOLDS = { explose: 0.4, monte: 0.1, stable: -0.2 } as const;
/** « Explose » demande aussi un vrai volume : 5 ventes par jour au moins (sinon « monte »). */
export const EXPLOSE_MIN_DAILY_SALES = 5;

export const COMMISSION_FLOOR = 0.05;
export const COMMISSION_CEIL = 0.3;
export const PRICE_ZONE = { min: 15, max: 60 } as const;

export interface ScoreInput {
  id: string;
  niche: NicheId;
  price_cents: number;
  commission_rate: number;
  /** null = la source ne le dit pas : critère « concurrence » ignoré. */
  affiliates: number | null;
  /** Ventes quotidiennes connues, du plus ancien au plus récent (14 jours conseillés). */
  sales: number[];
  /** Cumuls par période donnés par la source, utilisés tant que l'historique quotidien est trop court. */
  windows?: { last7: number; prev7: number } | null;
}

/** Jours d'historique quotidien nécessaires pour mesurer la croissance sans les cumuls de la source. */
export const MIN_DAYS_FOR_GROWTH = 10;

export interface GrowthStats {
  last7: number;
  prev7: number;
  growth7d: number; // 0.42 = +42 %
  dailyAvg7: number;
}

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

function growthFromTotals(last7: number, prev7: number): number {
  const growth = prev7 === 0 ? (last7 > 0 ? 1 : 0) : last7 / prev7 - 1;
  // Évite les valeurs extrêmes sur des volumes minuscules.
  return clamp(growth, -1, 5);
}

/**
 * Croissance des 7 derniers jours par rapport aux jours d'avant (7 au plus), en moyenne par jour :
 * avec 14 jours, c'est exactement « 7 derniers jours / 7 précédents ».
 */
export function computeGrowth(sales: number[]): GrowthStats {
  const last = sales.slice(-7);
  const prev = sales.slice(-14, -7);
  const last7 = sum(last);
  const dailyAvg7 = last.length ? last7 / last.length : 0;
  const prev7 = prev.length ? (sum(prev) / prev.length) * 7 : 0;
  const scaledLast7 = last.length ? (last7 / last.length) * 7 : 0;
  const growth7d = prev.length === 0 ? (last7 > 0 ? 1 : 0) : growthFromTotals(scaledLast7, prev7);
  return { last7, prev7, growth7d, dailyAvg7 };
}

/**
 * Croissance d'un produit selon ce qu'on sait : historique quotidien suffisant, sinon cumuls de la source,
 * sinon null (critère « croissance » indisponible pour l'instant).
 */
export function growthFor(input: Pick<ScoreInput, 'sales' | 'windows'>): GrowthStats | null {
  if (input.sales.length >= MIN_DAYS_FOR_GROWTH) return computeGrowth(input.sales);
  // Sans aucune vente avant les 7 derniers jours (produit qui vient d'arriver), pas de base de comparaison :
  // « +100 % » ne voudrait rien dire. La croissance attend nos propres relevés.
  if (input.windows && input.windows.prev7 > 0) {
    const { last7, prev7 } = input.windows;
    return { last7, prev7, growth7d: growthFromTotals(last7, prev7), dailyAvg7: last7 / 7 };
  }
  return null;
}

/** Ventes moyennes par jour sur 7 jours, si on les connaît. */
function dailyAverage(input: Pick<ScoreInput, 'sales' | 'windows'>, growth: GrowthStats | null): number | null {
  if (growth) return growth.dailyAvg7;
  const last = input.sales.slice(-7);
  return last.length ? sum(last) / last.length : null;
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

/**
 * Tendance d'après la croissance (et le volume pour « explose ») ; sans mesure (null), « stable », et
 * l'affichage dit « tendance en mesure ».
 */
export function trendFor(growth7d: number | null, dailySales: number | null = null): Trend {
  if (growth7d === null) return 'stable';
  if (growth7d >= TREND_THRESHOLDS.explose) {
    return dailySales !== null && dailySales < EXPLOSE_MIN_DAILY_SALES ? 'monte' : 'explose';
  }
  if (growth7d >= TREND_THRESHOLDS.monte) return 'monte';
  if (growth7d > TREND_THRESHOLDS.stable) return 'stable';
  return 'baisse';
}

/** Tendance d'un détail de score déjà calculé. */
export function trendOf(breakdown: Pick<ScoreBreakdown, 'growth_7d' | 'daily_sales_7d'>): Trend {
  return trendFor(breakdown.growth_7d, breakdown.daily_sales_7d);
}

/** Valeur au quantile q (0..1) d'une liste triée, avec interpolation. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Fonction qui place les points du jour (0 à 100) sur l'échelle affichée (15 à 90). */
export function dailyScale(points: number[]): (value: number) => number {
  const span = SCALE.max - SCALE.min;
  const sorted = [...points].sort((a, b) => a - b);
  if (sorted.length >= MIN_PRODUCTS_FOR_SCALING) {
    const low = quantile(sorted, SCALE_QUANTILES.low);
    const high = quantile(sorted, SCALE_QUANTILES.high);
    if (high - low >= MIN_SPREAD_FOR_SCALING) {
      return (value) => Math.round(SCALE.min + span * clamp((value - low) / (high - low)));
    }
  }
  return (value) => Math.round(SCALE.min + span * clamp(value / 100));
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

/** Phrase affichée quand la source ne fournit pas la donnée d'un critère. */
const UNAVAILABLE_SENTENCES: Record<ScorePart['key'], string> = {
  croissance:
    'Croissance pas encore mesurable : il faut quelques jours de relevés. En attendant, son poids est réparti sur les autres critères.',
  commission: 'Commission inconnue.',
  saturation:
    'Nombre d’affiliés non fourni par la source de données : ce critère est ignoré et son poids est réparti sur les autres critères.',
  prix: 'Prix inconnu.',
};

const PART_LABELS: Record<ScorePart['key'], string> = {
  croissance: 'Croissance',
  commission: 'Commission',
  saturation: 'Concurrence',
  prix: 'Prix',
};

function summarize(allParts: ScorePart[]): string {
  const parts = allParts.filter((p) => p.available !== false);
  const strong = parts.filter((p) => p.value >= 0.7).sort((a, b) => b.points - a.points);
  const weak = parts.filter((p) => p.value < 0.35).sort((a, b) => b.weight - a.weight);
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

/** Calcule le détail du score pour un produit, connaissant le centile de sa croissance dans sa niche. */
export function scoreOne(input: ScoreInput, growthPercentile: number, growth: GrowthStats | null = growthFor(input)): ScoreBreakdown {
  const daily = dailyAverage(input, growth);
  const available: Record<ScorePart['key'], boolean> = {
    croissance: growth !== null,
    commission: true,
    saturation: input.affiliates !== null && daily !== null,
    prix: true,
  };
  // Un produit en baisse ne peut pas prendre tous les points de croissance, même s'il est le
  // « moins pire » de sa niche.
  const growthValue = growth && growth.growth7d < 0 ? Math.min(growthPercentile, 0.5) : growthPercentile;
  const values: Record<ScorePart['key'], number> = {
    croissance: growth ? growthValue : 0,
    commission: commissionValue(input.commission_rate),
    saturation: available.saturation ? saturationValue(input.affiliates!, daily!) : 0,
    prix: priceValue(input.price_cents),
  };
  const sentences: Record<ScorePart['key'], string> = {
    croissance: growth ? growthSentence(growth, growthPercentile, input.niche) : UNAVAILABLE_SENTENCES.croissance,
    commission: commissionSentence(input.commission_rate, input.price_cents),
    saturation: available.saturation
      ? saturationSentence(values.saturation, input.affiliates!, daily!)
      : UNAVAILABLE_SENTENCES.saturation,
    prix: priceSentence(input.price_cents),
  };
  // Poids des critères indisponibles réparti au prorata sur les autres : le total reste sur 100.
  const keys = Object.keys(WEIGHTS) as Array<ScorePart['key']>;
  const availableWeight = sum(keys.filter((k) => available[k]).map((k) => WEIGHTS[k]));
  const scale = availableWeight > 0 ? 100 / availableWeight : 0;
  const parts: ScorePart[] = keys.map((key) => {
    const applied = available[key] ? WEIGHTS[key] * scale : 0;
    return {
      key,
      label: PART_LABELS[key],
      weight: WEIGHTS[key],
      available: available[key],
      applied_weight: round1(applied),
      value: available[key] ? round1(values[key] * 100) / 100 : 0,
      points: round1(values[key] * applied),
      sentence: sentences[key],
    };
  });
  const raw = Math.round(clamp(sum(keys.map((k) => (available[k] ? values[k] * WEIGHTS[k] * scale : 0))), 0, 100));
  return {
    // Total des points ; scoreProducts le remplace par le score sur l'échelle du jour (15 à 90).
    total: raw,
    raw,
    parts,
    growth_7d: growth ? Math.round(growth.growth7d * 1000) / 1000 : null,
    daily_sales_7d: daily === null ? null : Math.round(daily),
    summary: summarize(parts),
  };
}

/** Calcule les scores d'une liste de produits ; la croissance est classée par niche (produits mesurables seulement). */
export function scoreProducts(inputs: ScoreInput[]): Map<string, ScoreBreakdown> {
  const stats = new Map(inputs.map((i) => [i.id, growthFor(i)]));
  const byNiche = new Map<NicheId, number[]>();
  for (const input of inputs) {
    const growth = stats.get(input.id);
    if (!growth) continue;
    const list = byNiche.get(input.niche) ?? [];
    list.push(growth.growth7d);
    byNiche.set(input.niche, list);
  }
  const result = new Map<string, ScoreBreakdown>();
  for (const input of inputs) {
    const growth = stats.get(input.id) ?? null;
    const pct = growth ? percentileRank(byNiche.get(input.niche) ?? [], growth.growth7d) : 0;
    result.set(input.id, scoreOne(input, pct, growth));
  }
  const scale = dailyScale([...result.values()].map((b) => b.raw ?? b.total));
  for (const breakdown of result.values()) breakdown.total = scale(breakdown.raw ?? breakdown.total);
  return result;
}
