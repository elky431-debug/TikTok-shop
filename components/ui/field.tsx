import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Champs d'EtSmart : noirs, bordure 10 %, arrondi 12 px, 14 px ; au focus, bordure et anneau cyan (le contour
// clavier reste visible).
const control =
  'w-full rounded-xl border border-line-strong bg-bg px-4 text-sm text-fg placeholder:text-subtle transition-all duration-200 focus:border-cyan-ink/45 focus:outline-none focus:ring-1 focus:ring-cyan-ink/25 focus-visible:outline-2 focus-visible:outline-cyan aria-[invalid=true]:border-rose-ink';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-[5.5rem] py-3 leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(control, 'h-11 appearance-none bg-[length:1rem] pr-9', className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('mb-1.5 block text-sm font-semibold text-fg', className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-erreur`} className="mt-1.5 text-sm font-medium text-rose-ink" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-aide`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Puce sélectionnable (case à cocher ou bouton radio stylé). */
export function ChoiceChip({
  type = 'checkbox',
  name,
  value,
  defaultChecked,
  children,
  description,
  className,
  disabled,
}: {
  type?: 'checkbox' | 'radio';
  name: string;
  value: string;
  defaultChecked?: boolean;
  children: ReactNode;
  description?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'group relative flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-bg px-4 py-3 transition-colors hover:border-line-strong has-[:checked]:border-cyan-ink/50 has-[:checked]:bg-cyan-ink/[0.06] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 border-line-strong transition-colors peer-checked:border-cyan-ink peer-checked:bg-cyan-ink',
          type === 'radio' ? 'rounded-full' : 'rounded-md',
        )}
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3 text-bg" fill="none">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block font-semibold leading-snug">{children}</span>
        {description ? <span className="mt-0.5 block text-sm text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
