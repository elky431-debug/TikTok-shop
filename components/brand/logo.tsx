import Link from 'next/link';
import { BRAND, BRAND_SPLIT } from '@/lib/brand';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: { icon: 28, text: 'text-lg' },
  md: { icon: 36, text: 'text-xl' },
  lg: { icon: 52, text: 'text-2xl' },
};

/**
 * Icône du logo : un losange avec le décalage cyan / rose façon TikTok,
 * posée sur un halo lumineux comme le logo d'EtSmart. Le décalage est réservé au logo et au score.
 */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('relative inline-flex shrink-0 transition-transform duration-200 group-hover:rotate-[5deg] group-hover:scale-[1.08]', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 scale-150 opacity-40 blur-xl"
        style={{ background: 'radial-gradient(circle, rgba(37,244,238,0.45) 0%, rgba(254,44,85,0.25) 100%)' }}
      />
      <svg viewBox="0 0 32 32" width={size} height={size} className="relative" style={{ filter: 'drop-shadow(0 0 8px rgba(37,244,238,0.3))' }}>
        <path d="M16 3.5 27 14 16 28.5 5 14Z" fill="#25F4EE" transform="translate(-1.4 -1)" />
        <path d="M16 3.5 27 14 16 28.5 5 14Z" fill="#FE2C55" transform="translate(1.4 1)" />
        <path d="M16 3.5 27 14 16 28.5 5 14Z" fill="rgb(var(--fg))" />
        <path d="M11 14h10M16 3.5 13 14l3 14.5M16 3.5 19 14l-3 14.5" stroke="rgb(var(--bg))" strokeOpacity=".55" strokeWidth="1.1" fill="none" />
      </svg>
    </span>
  );
}

export function Logo({ href = '/', size = 'md', className }: { href?: string; size?: keyof typeof SIZES; className?: string }) {
  const { icon, text } = SIZES[size];
  return (
    <Link href={href} className={cn('group inline-flex items-center gap-2', className)} aria-label={`${BRAND}, accueil`}>
      <LogoMark size={icon} />
      <span className={cn('font-bold tracking-tight', text)}>
        <span className="text-fg">{BRAND_SPLIT[0]}</span>
        <span className="text-gradient">{BRAND_SPLIT[1]}</span>
      </span>
    </Link>
  );
}
