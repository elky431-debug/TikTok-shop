'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Copie un texte et confirme avec le même verbe : « Copier » → « Copié ». */
export function CopyButton({
  text,
  label = 'Copier',
  copiedLabel = 'Copié',
  className,
  size = 'sm',
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  size?: 'sm' | 'icon';
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
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
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors',
        size === 'icon' ? 'h-9 w-9 justify-center hover:bg-surface' : 'h-9 border border-line px-3.5 text-sm hover:bg-surface',
        copied && 'border-gain/40 text-gain',
        className,
      )}
      aria-label={size === 'icon' ? (copied ? copiedLabel : label) : undefined}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {size === 'icon' ? null : <span aria-live="polite">{copied ? copiedLabel : label}</span>}
    </button>
  );
}
