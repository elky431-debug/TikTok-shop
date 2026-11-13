'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/** Petit bouton d'envoi (icône seule) avec un indicateur pendant le traitement. */
export function IconSubmit({ label, children, className, disabled }: { label: string; children: ReactNode; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-50',
        className,
      )}
    >
      {pending ? <Spinner /> : children}
    </button>
  );
}
