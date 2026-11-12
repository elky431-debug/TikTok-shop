import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Pastille d'annonce au-dessus d'un titre : point cyan qui pulse doucement. */
export function AnnouncementPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-cyan-ink/20 bg-cyan-ink/[0.04] px-4 py-2',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-ink animate-pulse-dot" aria-hidden="true" />
      <span className="text-xs font-medium text-fg/70">{children}</span>
    </span>
  );
}
