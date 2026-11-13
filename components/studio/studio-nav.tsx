import { Fingerprint, Layers, PenLine } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'ecrire', href: '/app/studio', label: 'Écrire', icon: PenLine },
  { id: 'serie', href: '/app/studio/serie', label: 'Série de 20', icon: Layers },
  { id: 'style', href: '/app/studio/style', label: 'Mon style', icon: Fingerprint },
] as const;

export type StudioTab = (typeof TABS)[number]['id'];

/**
 * Onglets du studio au style d'EtSmart : texte blanc pour l'onglet ouvert, trait en dégradé dessous, trait de séparation
 * sur toute la largeur. Défilement horizontal sur mobile.
 */
export function StudioNav({ active, badges = {} }: { active: StudioTab; badges?: Partial<Record<StudioTab, string>> }) {
  return (
    <nav aria-label="Studio" className="scrollbar-none -mx-3 mb-8 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max border-b border-line">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const current = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-all sm:px-6',
                  current ? 'text-fg' : 'text-muted hover:text-fg/80',
                )}
              >
                <Icon className={cn('h-4 w-4', current && 'text-cyan-ink')} aria-hidden="true" />
                {tab.label}
                {badges[tab.id] ? (
                  <span className="rounded-full border border-cyan-ink/25 bg-cyan-ink/10 px-1.5 py-px text-[0.68rem] font-bold text-cyan-ink">{badges[tab.id]}</span>
                ) : null}
                {current ? <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[image:var(--gradient)]" aria-hidden="true" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
