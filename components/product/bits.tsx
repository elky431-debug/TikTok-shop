import { Flame, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { Trend } from '@/lib/db/types';
import { TREND_LABELS } from '@/lib/score';
import { cn, formatGrowth } from '@/lib/utils';

export function ProductImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG locaux générés, pas d'optimisation utile
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn('aspect-square shrink-0 rounded-xl bg-surface object-cover', className)}
    />
  );
}

const TREND_STYLE: Record<Trend, string> = {
  explose: 'bg-rose-soft text-rose-ink',
  monte: 'bg-cyan-soft text-cyan-ink',
  stable: 'bg-surface text-muted',
  baisse: 'bg-warn-soft text-warn',
};

const TREND_ICON = { explose: Flame, monte: TrendingUp, stable: Minus, baisse: TrendingDown };

export function TrendBadge({ trend, growth, className }: { trend: Trend; growth?: number; className?: string }) {
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
