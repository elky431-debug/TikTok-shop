import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Trois niveaux de surfaces, pour une hiérarchie lisible (pas de cartes toutes identiques) :
 * - Panel  : fond gris discret, sans bordure ni ombre (regroupement secondaire)
 * - Card   : bloc blanc bordé (contenu principal)
 * - Callout: encart teinté pour une information à ne pas rater
 */
export function Panel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-2xl bg-surface p-4 sm:p-5', className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-2xl border border-line bg-raised p-4 sm:p-5', className)} {...props} />;
}

const calloutTones = {
  rose: 'bg-rose-soft text-fg border-rose/30',
  cyan: 'bg-cyan-soft text-fg border-cyan-ink/25',
  gain: 'bg-gain-soft text-fg border-gain/25',
  warn: 'bg-warn-soft text-fg border-warn/30',
  neutral: 'bg-surface text-fg border-line',
};

export function Callout({
  tone = 'neutral',
  title,
  children,
  icon,
  className,
  action,
}: {
  tone?: keyof typeof calloutTones;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn('flex gap-3 rounded-2xl border p-4', calloutTones[tone], className)}>
      {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold leading-snug">{title}</p> : null}
        {children ? <div className={cn('text-sm leading-relaxed', title ? 'mt-1 text-fg/85' : '')}>{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

const badgeTones = {
  neutral: 'bg-surface text-fg',
  rose: 'bg-rose-soft text-rose-ink',
  cyan: 'bg-cyan-soft text-cyan-ink',
  gain: 'bg-gain-soft text-gain',
  warn: 'bg-warn-soft text-warn',
  ink: 'bg-fg text-bg',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-surface', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', pct >= 100 ? 'bg-gain' : 'bg-[image:var(--gradient)]')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-surface', className)} aria-hidden="true">
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-bg/50 to-transparent" />
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-dashed border-line px-5 py-10 text-center', className)}>
      <p className="text-lg font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-prose text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
