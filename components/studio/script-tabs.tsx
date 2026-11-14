'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Onglets « Script 1 / 2 / 3 » au style d'EtSmart (trait en dégradé sous l'onglet ouvert). Les trois scripts restent
 * dans la page (les retouches et les ancres #script-2 continuent de marcher) : seul l'onglet ouvert est affiché.
 */
export function ScriptTabs({ labels, panels, badges = [] }: { labels: string[]; panels: ReactNode[]; badges?: Array<string | null> }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  // Ancre #script-N (après une retouche) : ouvre le bon onglet.
  useEffect(() => {
    const sync = () => {
      const match = /^#script-(\d)$/.exec(window.location.hash);
      if (match) {
        const index = Number(match[1]) - 1;
        if (index >= 0 && index < labels.length) setActive(index);
      }
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [labels.length]);

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (active + delta + labels.length) % labels.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Scripts" className="flex border-b border-line">
        {labels.map((label, i) => (
          <button
            key={label}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`onglet-script-${i + 1}`}
            aria-selected={active === i}
            aria-controls={`script-${i + 1}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKey}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-1.5 px-2 py-3 text-sm font-semibold transition-colors sm:flex-none sm:gap-2 sm:px-7',
              active === i ? 'text-fg' : 'text-muted hover:text-fg/80',
            )}
          >
            {label}
            {badges[i] ? (
              <span className="rounded-full border border-cyan-ink/25 bg-cyan-ink/10 px-1.5 py-px text-[0.68rem] font-bold text-cyan-ink">{badges[i]}</span>
            ) : null}
            {active === i ? <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[image:var(--gradient)]" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <div
          key={i}
          id={`script-${i + 1}`}
          role="tabpanel"
          aria-labelledby={`onglet-script-${i + 1}`}
          hidden={active !== i}
          tabIndex={0}
          className={cn('scroll-mt-24 pt-6 focus-visible:outline-none', active === i && 'animate-fade-up motion-reduce:animate-none')}
        >
          {panel}
        </div>
      ))}
    </div>
  );
}
