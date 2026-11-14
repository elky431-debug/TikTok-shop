'use client';

import { Info } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Info-bulle : les explications longues quittent la page et s'ouvrent au survol, au focus ou au toucher d'un petit « i ».
 */
export function InfoTip({
  children,
  label = 'En savoir plus',
  className,
  side = 'top',
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  side?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cn('relative inline-flex align-middle', className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full text-subtle transition-colors hover:text-fg"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className={cn(
          'absolute left-1/2 z-40 w-64 -translate-x-1/2 rounded-xl border border-line bg-raised px-3 py-2.5 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-muted shadow-[0_18px_40px_-16px_rgb(0_0_0/0.25)]',
          side === 'top' ? 'bottom-8' : 'top-8',
        )}
      >
        {children}
      </span>
    </span>
  );
}
