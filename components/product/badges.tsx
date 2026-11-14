import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/surface';
import type { Trend } from '@/lib/db/types';
import { BADGES, type BadgeId } from '@/lib/radar/badges';
import type { WhyNow } from '@/lib/radar/why-now';
import { cn } from '@/lib/utils';

/**
 * Badges automatiques. « En baisse » n'est pas répété quand le badge de tendance dit déjà « Baisse ». Le titre de
 * chaque badge donne sa règle chiffrée.
 */
export function ProductBadges({
  badges,
  trend,
  growthKnown,
  className,
}: {
  badges: BadgeId[];
  trend?: Trend;
  growthKnown?: boolean;
  className?: string;
}) {
  const shown = badges.filter((b) => !(b === 'baisse' && trend === 'baisse' && growthKnown));
  if (!shown.length) return null;
  return (
    <span className={cn('inline-flex flex-wrap gap-1.5', className)}>
      {shown.map((b) => (
        <Badge key={b} tone={BADGES[b].tone} title={BADGES[b].rule} className="px-2">
          {BADGES[b].label}
        </Badge>
      ))}
    </span>
  );
}

/** « Pourquoi maintenant » : la phrase du jour, avec sa provenance (IA, simulation ou calcul sur les chiffres). */
export function WhyNowLine({
  whyNow,
  className,
  withLabel = false,
  compact = false,
}: {
  whyNow: WhyNow | null;
  className?: string;
  withLabel?: boolean;
  compact?: boolean;
}) {
  if (!whyNow) return null;
  const origin = whyNow.source === 'ia' ? 'écrit par l’IA à partir des chiffres' : whyNow.source === 'simulation' ? 'simulation sans IA, calculée sur les chiffres' : 'calculé sur les chiffres';
  return (
    <p className={cn('flex gap-1.5 leading-snug', compact ? 'text-xs text-muted' : 'text-sm text-fg/85', className)} title={compact ? whyNow.sentence : undefined}>
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-ink" aria-hidden="true" />
      <span className={compact ? 'line-clamp-1' : undefined}>
        {withLabel ? <span className="font-semibold text-fg">Pourquoi maintenant : </span> : <span className="sr-only">Pourquoi maintenant : </span>}
        {whyNow.sentence}
        {withLabel ? <span className="sr-only"> ({origin})</span> : null}
      </span>
    </p>
  );
}
