import type { Product, ProductSnapshot, Trend } from '@/lib/db/types';
import { quantile } from '@/lib/score';

/** Statistiques d'une série de scores, pour vérifier que l'échelle reste bien répartie (environ 15 à 90). */
export interface Distribution {
  count: number;
  min: number;
  p5: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
  max: number;
  /** Part des scores dans [15, 90]. */
  inTarget: number;
  /** Nombre de scores par tranche de 10 (0–9, 10–19, … 90–100). */
  histogram: number[];
}

export { quantile };

export function distribution(values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const histogram = Array.from({ length: 10 }, () => 0);
  for (const v of sorted) histogram[Math.min(9, Math.floor(v / 10))]++;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    count: sorted.length,
    min: sorted[0] ?? NaN,
    p5: round(quantile(sorted, 0.05)),
    p25: round(quantile(sorted, 0.25)),
    median: round(quantile(sorted, 0.5)),
    p75: round(quantile(sorted, 0.75)),
    p95: round(quantile(sorted, 0.95)),
    max: sorted.at(-1) ?? NaN,
    inTarget: sorted.length ? round((sorted.filter((v) => v >= 15 && v <= 90).length / sorted.length) * 100) : 0,
    histogram,
  };
}

export function trendCounts(items: Array<{ trend: Trend }>): Record<Trend, number> {
  const counts: Record<Trend, number> = { explose: 0, monte: 0, stable: 0, baisse: 0 };
  for (const item of items) counts[item.trend]++;
  return counts;
}

/** Vue d'ensemble : scores du jour par source, et sur l'historique disponible (7 jours au moins si possible). */
export function summarize(products: Product[], snapshots: ProductSnapshot[]) {
  const byProvider = new Map<string, Product[]>();
  for (const p of products) byProvider.set(p.provider, [...(byProvider.get(p.provider) ?? []), p]);
  const days = [...new Set(snapshots.map((s) => s.date))].sort();
  return {
    providers: [...byProvider.entries()].map(([provider, list]) => ({
      provider,
      today: distribution(list.map((p) => p.latest_score)),
      trends: trendCounts(list),
      missing: Object.fromEntries(
        ['croissance', 'saturation'].map((key) => [
          key,
          list.filter((p) => p.latest_breakdown?.parts.find((part) => part.key === key)?.available === false).length,
        ]),
      ),
    })),
    history: { days: days.length, from: days[0] ?? null, to: days.at(-1) ?? null, scores: distribution(snapshots.map((s) => s.score)) },
  };
}
