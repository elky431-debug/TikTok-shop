import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export function scoreTier(score: number): { label: string; tone: 'cyan' | 'neutral' | 'muted' } {
  if (score >= 75) return { label: 'Très forte opportunité', tone: 'cyan' };
  if (score >= 60) return { label: 'Bonne opportunité', tone: 'cyan' };
  if (score >= 45) return { label: 'Opportunité moyenne', tone: 'neutral' };
  return { label: 'Opportunité faible', tone: 'muted' };
}

const sizes = {
  sm: 'text-2xl',
  md: 'text-4xl',
  lg: 'text-6xl',
  xl: 'text-7xl sm:text-8xl',
};

/**
 * Signature visuelle : le score d'opportunité, en grand, avec le décalage cyan / rose.
 * C'est le seul endroit (avec le logo) où cet effet apparaît.
 */
export function ScoreValue({
  score,
  locked = false,
  size = 'md',
  showMax = true,
  className,
}: {
  score: number | null;
  locked?: boolean;
  size?: keyof typeof sizes;
  showMax?: boolean;
  className?: string;
}) {
  if (locked || score === null) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 font-bold text-subtle', className)}>
        <span className={cn('num select-none leading-none tracking-tight blur-[3px]', sizes[size])} aria-hidden="true">
          88
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Score Pro
        </span>
        <span className="sr-only">Score réservé au plan Pro</span>
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-baseline gap-1 font-bold', className)}>
      <span className={cn('num split-glow leading-none tracking-tight text-fg', sizes[size])} aria-label={`Score ${score} sur 100`}>
        {score}
      </span>
      {showMax ? (
        <span className="num text-sm font-semibold text-muted" aria-hidden="true">
          /100
        </span>
      ) : null}
    </span>
  );
}
