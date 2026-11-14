'use client';

import { Check, Copy, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Les 10 accroches en liste compacte : un clic sur la ligne la copie. Le petit bouton « nouvelle accroche » n'apparaît
 * qu'au survol, au focus, ou sur la ligne qu'on vient de toucher (téléphone).
 */
export function HookList({
  docId,
  hooks,
  fresh,
  canRegenerate,
  regenerate,
}: {
  docId: string;
  hooks: string[];
  /** Accroche qui vient d'être remplacée (mise en avant). */
  fresh: number;
  canRegenerate: boolean;
  regenerate: (formData: FormData) => Promise<void>;
}) {
  const [copied, setCopied] = useState<number | null>(null);
  const [touched, setTouched] = useState<number | null>(fresh >= 0 ? fresh : null);

  async function copy(index: number) {
    const text = hooks[index];
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(index);
    setTouched(index);
    window.setTimeout(() => setCopied((c) => (c === index ? null : c)), 1600);
  }

  return (
    <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-raised">
      {hooks.map((hook, index) => (
        <li
          key={`${index}-${hook}`}
          className={cn('group relative flex items-center', index === fresh && 'bg-cyan-soft animate-fade-up motion-reduce:animate-none')}
        >
          <button
            type="button"
            onClick={() => copy(index)}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface focus-visible:bg-surface"
            aria-label={copied === index ? `Accroche ${index + 1} copiée` : `Copier l’accroche ${index + 1} : ${hook}`}
          >
            <span className="num w-5 shrink-0 text-xs font-bold text-subtle">{index + 1}</span>
            <span data-hook className="min-w-0 flex-1 font-semibold leading-snug">
              {hook}
            </span>
            <span
              className={cn(
                'flex shrink-0 items-center gap-1 text-xs font-semibold',
                copied === index ? 'text-gain' : 'text-subtle opacity-0 group-hover:opacity-100',
              )}
              aria-hidden="true"
            >
              {copied === index ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === index ? 'Copiée' : null}
            </span>
          </button>
          {canRegenerate ? (
            <form
              action={regenerate}
              className={cn(
                'shrink-0 pr-2 transition-opacity',
                touched === index ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
              )}
            >
              <input type="hidden" name="script" value={docId} />
              <input type="hidden" name="index" value={index} />
              <RegenerateButton index={index} />
            </form>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function RegenerateButton({ index }: { index: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-fg"
      aria-label={`Nouvelle accroche à la place de la n°${index + 1}`}
      title="Nouvelle accroche"
    >
      <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} aria-hidden="true" />
    </button>
  );
}
