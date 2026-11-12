import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

/** Pépite stylisée : un éclat (losange) + le nom. Le décalage cyan/rose est réservé au logo et au score. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-7 w-7 text-fg', className)} aria-hidden="true">
      <path d="M16 3.5 27 14 16 28.5 5 14Z" fill="#25F4EE" transform="translate(-1.4 -1)" />
      <path d="M16 3.5 27 14 16 28.5 5 14Z" fill="#FE2C55" transform="translate(1.4 1)" />
      <path d="M16 3.5 27 14 16 28.5 5 14Z" fill="currentColor" />
      <path
        d="M11 14h10M16 3.5 13 14l3 14.5M16 3.5 19 14l-3 14.5"
        stroke="rgb(var(--bg))"
        strokeOpacity=".6"
        strokeWidth="1.1"
        fill="none"
      />
    </svg>
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2 font-semibold', className)} aria-label={`${BRAND}, accueil`}>
      <LogoMark />
      <span className="text-xl tracking-tight">{BRAND}</span>
    </Link>
  );
}
