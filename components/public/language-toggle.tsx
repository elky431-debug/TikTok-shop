'use client';

import { Check, ChevronDown, Globe } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Sélecteur de langue en pastille (V1 : français uniquement, les autres langues viendront). */
export function LanguageToggle() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Langue : français"
        className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-fg/5 px-2.5 py-1.5 text-xs text-fg/70 transition-all hover:border-cyan-ink/30 hover:bg-fg/10 hover:text-fg"
      >
        <Globe size={14} className="text-cyan-ink" aria-hidden="true" />
        <span className="font-semibold">FR</span>
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[160px] overflow-hidden rounded-xl border border-line-strong bg-raised/95 py-1 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <p className="flex w-full items-center justify-between bg-cyan-ink/10 px-3 py-2 text-xs text-cyan-ink">
            <span className="flex items-center gap-2">
              <span className="w-5 font-bold">FR</span>
              <span className="font-normal text-muted">Français</span>
            </span>
            <Check size={13} aria-hidden="true" />
          </p>
          <p className="px-3 py-2 text-[11px] text-subtle">Autres langues bientôt.</p>
        </div>
      ) : null}
    </div>
  );
}
