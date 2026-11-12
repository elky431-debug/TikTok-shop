import type { ProductDetails } from '@/lib/db/types';
import { daysBetween } from '@/lib/utils';

export interface PeriodBar {
  days: number;
  label: string;
  /** Ventes cumulées sur la période. */
  total: number;
  /** Moyenne par jour sur la période : c'est elle qu'on compare d'une barre à l'autre. */
  perDay: number;
}

const WINDOWS = [
  { key: 'd1', days: 1 },
  { key: 'd7', days: 7 },
  { key: 'd15', days: 15 },
  { key: 'd30', days: 30 },
  { key: 'd60', days: 60 },
  { key: 'd90', days: 90 },
] as const;

/**
 * Barres « ventes moyennes par jour » sur 1, 7, 15, 30, 60 et 90 jours, d'après les cumuls de la source.
 * Une période plus longue que l'historique de la source (premier relevé récent) ne dit rien de plus que la plus
 * courte : elle est écartée plutôt que d'afficher une moyenne trompeuse.
 */
export function periodBars(details: ProductDetails | null, today: string): PeriodBar[] {
  if (!details) return [];
  const covered = details.first_seen ? Math.max(1, daysBetween(details.first_seen, today) + 1) : Number.POSITIVE_INFINITY;
  return WINDOWS.filter((w) => w.days === 1 || w.days <= covered)
    .map((w) => ({ w, total: details.sales[w.key] }))
    .filter((x): x is { w: (typeof WINDOWS)[number]; total: number } => x.total !== null)
    .map(({ w, total }) => ({
      days: w.days,
      label: w.days === 1 ? '24 h' : `${w.days} j`,
      total,
      perDay: Math.round((total / w.days) * 10) / 10,
    }));
}
