import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Surfaces de l'appli, copiées d'EtSmart (tableau de bord) avec la palette TikTok :
 * - Panel  : regroupement secondaire, fond légèrement relevé, sans bordure
 * - Card   : bloc noir bordé (rounded-2xl, bordure 10 %), halo cyan discret au survol
 * - Callout: encart teinté pour une information à ne pas rater
 */
export function Panel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-xl border border-line bg-raised p-4 sm:p-5', className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-bg p-5 transition-[border-color,box-shadow] duration-300 hover:border-line-strong hover:shadow-[0_0_40px_-12px_rgb(var(--cyan)/0.2)] sm:p-6',
        className,
      )}
      {...props}
    />
  );
}

/** Titre de section d'EtSmart : étiquette 10 px en capitales espacées suivie d'un trait qui s'efface. */
export function SectionTitle({ children, action, className, as: Tag = 'h2', id }: { children: ReactNode; action?: ReactNode; className?: string; as?: 'h2' | 'h3'; id?: string }) {
  return (
    <div className={cn('mb-5 flex items-center gap-4', className)}>
      <Tag id={id} className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {children}
      </Tag>
      <div className="h-px flex-1 bg-gradient-to-r from-fg/20 to-transparent" aria-hidden="true" />
      {action}
    </div>
  );
}

/** Pastille d'icône d'EtSmart (36 px, bordure et fond cyan). `tone="neutral"` pour l'alternance blanc/cyan. */
export function IconChip({ children, tone = 'cyan', size = 'md', className }: { children: ReactNode; tone?: 'cyan' | 'neutral' | 'rose'; size?: 'md' | 'lg'; className?: string }) {
  const tones = {
    cyan: 'border-cyan-ink/30 bg-cyan-ink/10 text-cyan-ink',
    neutral: 'border-fg/15 bg-fg/[0.04] text-cyan-ink',
    rose: 'border-rose-ink/30 bg-rose-ink/10 text-rose-ink',
  };
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center border',
        size === 'md' ? 'h-9 w-9 rounded-lg' : 'h-10 w-10 rounded-xl',
        tones[tone],
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/** Pastille de variation d'EtSmart (hausse en cyan, baisse en gris, sans comparaison en gris clair). */
export function TrendPill({ direction, children, className }: { direction: 'up' | 'down' | 'flat'; children: ReactNode; className?: string }) {
  const tones = {
    up: 'border-cyan-ink/30 bg-cyan-ink/10 text-cyan-ink',
    down: 'border-fg/15 bg-fg/5 text-muted',
    flat: 'border-line bg-fg/[0.04] text-muted',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums', tones[direction], className)}>
      {children}
    </span>
  );
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
  neutral: 'border-line-strong bg-fg/5 text-fg/80',
  rose: 'border-rose-ink/30 bg-rose-ink/10 text-rose-ink',
  cyan: 'border-cyan-ink/25 bg-cyan-ink/10 text-cyan-ink',
  gain: 'border-gain/25 bg-gain/10 text-gain',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  ink: 'border-transparent bg-fg text-bg',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
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
      className={cn('h-2 w-full overflow-hidden rounded-full bg-fg/10', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-out', pct >= 100 ? 'bg-gain' : 'bg-[image:var(--gradient)]')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  // EtSmart : pulsation d'opacité 0,5 → 1 → 0,5 en 1,5 s (figée si l'utilisateur réduit les animations).
  return <div className={cn('animate-skeleton rounded-md bg-fg/10', className)} aria-hidden="true" />;
}

export function EmptyState({
  title,
  children,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-dashed border-line-strong bg-bg px-6 py-12 text-center', className)}>
      {icon ? <IconChip size="lg" className="mx-auto mb-4">{icon}</IconChip> : null}
      <p className="text-base font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * En-tête de page d'EtSmart : étiquette 10 px, titre gras serré (32 px sur ordinateur), une phrase d'utilité,
 * trait en bas. Les actions passent à droite sur grand écran.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-8 flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-[2rem]">{title}</h1>
        {description ? <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
