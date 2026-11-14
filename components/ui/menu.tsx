'use client';

import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Menu « … » pour les actions secondaires (copier tout, export, supprimer) : elles restent à portée sans encombrer la page.
 * Se ferme au clic dehors, avec Échap, ou après un choix.
 */
export function MoreMenu({
  children,
  label = 'Plus d’actions',
  className,
  align = 'right',
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted transition-colors hover:bg-surface hover:text-fg"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      <div
        id={id}
        hidden={!open}
        className={cn(
          'absolute top-12 z-30 min-w-56 overflow-hidden rounded-xl border border-line bg-raised p-1.5 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.25)]',
          align === 'right' ? 'right-0' : 'left-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Classe commune des lignes du menu (liens, boutons, boutons d'envoi). */
export const menuItemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-fg transition-colors hover:bg-surface disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted';
