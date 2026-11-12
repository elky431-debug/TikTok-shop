'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

/** Question de FAQ en accordéon, au style EtSmart. */
export function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rounded-2xl border border-line bg-fg/[0.02] transition-colors hover:border-line-strong">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`${id}-reponse`}
          className="group flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
        >
          <span className="text-[15px] font-semibold text-fg/90 transition-colors group-hover:text-fg">{question}</span>
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs text-muted transition-all',
              open && 'rotate-45 border-cyan-ink/30 text-cyan-ink',
            )}
            aria-hidden="true"
          >
            +
          </span>
        </button>
      </h3>
      <div id={`${id}-reponse`} hidden={!open} className="px-6 pb-5">
        <p className="text-sm leading-relaxed text-muted">{answer}</p>
      </div>
    </div>
  );
}
