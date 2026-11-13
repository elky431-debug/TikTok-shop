import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Choix compact (bouton radio stylé) pour les réglages du studio. L'aide n'apparaît qu'à partir de la tablette :
 * sur mobile, 8 formats avec leur phrase prendraient deux écrans.
 */
export function OptionChip({
  name,
  value,
  defaultChecked,
  children,
  hint,
  className,
  disabled,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
  /** Option fermée par le plan : visible, non sélectionnable. */
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        disabled && 'cursor-not-allowed opacity-60 hover:border-line',
        'relative flex min-h-11 cursor-pointer flex-col justify-center rounded-xl border border-line bg-raised px-3.5 py-2.5 transition-colors hover:border-line-strong has-[:checked]:border-cyan-ink/60 has-[:checked]:bg-cyan-ink/[0.07] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan',
        className,
      )}
    >
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} disabled={disabled} className="peer sr-only" />
      <span className="text-sm font-semibold leading-snug peer-checked:text-fg">{children}</span>
      {hint ? <span className="mt-0.5 hidden text-xs leading-snug text-muted sm:block">{hint}</span> : null}
    </label>
  );
}

/** Groupe de choix avec sa légende. */
export function OptionGroup({ legend, children, className, columns = 'grid-cols-2 sm:grid-cols-4' }: { legend: ReactNode; children: ReactNode; className?: string; columns?: string }) {
  return (
    <fieldset className={className}>
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className={cn('grid gap-2', columns)}>{children}</div>
    </fieldset>
  );
}
