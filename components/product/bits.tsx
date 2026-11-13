import { Flame, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import type { Trend } from '@/lib/db/types';
import { TREND_LABELS } from '@/lib/score';
import { cn, formatGrowth } from '@/lib/utils';

export { ProductImage } from './product-image';

const TREND_STYLE: Record<Trend, string> = {
  explose: 'trend-explose',
  monte: 'bg-positive/10 text-positive',
  stable: 'bg-surface text-muted',
  baisse: 'bg-warn-soft text-warn',
};

const TREND_ICON = { explose: Flame, monte: TrendingUp, stable: Minus, baisse: TrendingDown };

export function TrendBadge({
  trend,
  growth,
  measured = true,
  className,
}: {
  trend: Trend;
  growth?: number;
  /** false = croissance pas encore mesurable : badge neutre « Tendance en mesure ». */
  measured?: boolean;
  className?: string;
}) {
  if (!measured) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted', className)}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Tendance en mesure
      </span>
    );
  }
  const Icon = TREND_ICON[trend];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold',
        TREND_STYLE[trend],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {TREND_LABELS[trend]}
      {growth !== undefined ? <span className="num font-medium">{formatGrowth(growth)}</span> : null}
    </span>
  );
}
