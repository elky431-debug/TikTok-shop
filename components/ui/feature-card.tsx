import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Carte de fonctionnalité au style EtSmart : icône cyan dans un carré arrondi,
 * titre blanc, description grise ; bordure en dégradé et légère montée au survol.
 */
export function FeatureCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('feature-card h-full p-5', className)}>
      <div className="icon-chip mb-3 h-10 w-10">
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-fg">{title}</h3>
      <p className="text-xs leading-relaxed text-muted">{children}</p>
    </div>
  );
}
