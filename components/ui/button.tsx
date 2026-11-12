import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'ink';
export type ButtonSize = 'sm' | 'md' | 'lg';

/*
 * Boutons au style EtSmart, couleurs TikTok.
 * Principal : rose, arrondi 12 px ; au survol il monte de 2 px et le halo rose s'allume (200 ms).
 */
const base =
  'group/btn inline-flex items-center justify-center gap-2 font-semibold transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-rose-fill text-white hover:-translate-y-0.5 hover:shadow-[var(--glow-pink)] active:translate-y-0',
  ink: 'bg-fg text-bg hover:-translate-y-0.5 hover:bg-fg/90',
  secondary: 'border border-line-strong bg-transparent text-fg hover:bg-surface',
  outline: 'border border-line-strong bg-transparent text-fg hover:bg-surface',
  ghost: 'bg-transparent text-muted hover:bg-surface hover:text-fg',
  danger: 'border border-rose-ink/40 bg-transparent text-rose-ink hover:bg-rose-soft',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 rounded-lg px-5 text-sm',
  md: 'h-11 rounded-xl px-6 text-sm',
  lg: 'h-12 rounded-xl px-8 text-sm',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

/** Flèche → qui glisse de 4 px vers la droite au survol du bouton. */
export function ButtonArrow() {
  return <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-1" aria-hidden="true" />;
}

type ButtonProps = ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  arrow?: boolean;
};

export function LinkButton({ variant = 'primary', size = 'md', className, arrow, children, ...props }: LinkButtonProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {children}
      {arrow ? <ButtonArrow /> : null}
    </Link>
  );
}
