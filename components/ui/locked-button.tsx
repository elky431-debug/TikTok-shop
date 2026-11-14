'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Bouton d'une fonction fermée par le plan : visible avec un cadenas, et la limite ne s'affiche qu'au clic
 * (« Export PDF inclus dans Elite · Voir les plans »). Rien n'est écrit sur la page tant qu'on ne le touche pas.
 */
export function LockedButton({
  children,
  plan,
  feature,
  className,
  icon,
}: {
  children: ReactNode;
  /** Plan qui ouvre la fonction (« Elite »). */
  plan: string;
  /** Nom de la fonction, pour le message (« L’export PDF »). */
  feature: string;
  className?: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
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
    <span ref={root} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface hover:text-fg',
          className,
        )}
      >
        {icon}
        {children}
        <Lock className="h-3.5 w-3.5" aria-label={`Inclus dans ${plan}`} />
      </button>
      <span
        id={id}
        role="status"
        hidden={!open}
        className="absolute bottom-11 left-0 z-30 w-60 rounded-xl border border-line bg-raised p-3 text-sm shadow-[0_18px_40px_-16px_rgb(0_0_0/0.25)]"
      >
        <span className="block font-semibold">
          {feature} est inclus dans {plan}.
        </span>
        <Link href="/app/passer-pro" className="mt-1.5 inline-block font-semibold text-cyan-ink underline underline-offset-2">
          Voir les plans
        </Link>
      </span>
    </span>
  );
}
