/* eslint-disable @next/next/no-img-element -- fichiers PNG déjà à la bonne taille (scripts/brand-assets.py) */
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * Logo définitif de Tracktout, utilisé tel quel (image fournie, recadrée, fond rendu transparent par
 * `scripts/brand-assets.py`) : jamais redessiné ni recoloré. Les lettres « rack » étant noires, le thème noir (option du
 * compte) pose le logo sur une plaque blanche plutôt que de toucher à ses couleurs.
 */
const LOGO = { src: '/brand/tracktout-logo-480.png', width: 480, height: 116 };
const MARK = '/brand/tracktout-icone-128.png';

const HEIGHTS = { sm: 26, md: 32, lg: 44 } as const;

/** Le logo complet (T fléché + « Tracktout »), à une hauteur donnée. */
export function LogoImage({ height = 32, className }: { height?: number; className?: string }) {
  return (
    <img
      src={LOGO.src}
      width={Math.round((height * LOGO.width) / LOGO.height)}
      height={height}
      alt={BRAND}
      decoding="async"
      draggable={false}
      className={cn('block shrink-0 select-none dark:rounded-lg dark:bg-white dark:px-1.5 dark:py-0.5 dark:box-content', className)}
    />
  );
}

/** Icône carrée : le T fléché seul, découpé dans le même logo. Décorative (le nom est dit à côté ou dans le lien). */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <img
      src={MARK}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className={cn('block shrink-0 select-none', className)}
    />
  );
}

export function Logo({ href = '/', size = 'md', className }: { href?: string; size?: keyof typeof HEIGHTS; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center', className)} aria-label={`${BRAND}, accueil`}>
      <LogoImage height={HEIGHTS[size]} />
    </Link>
  );
}
