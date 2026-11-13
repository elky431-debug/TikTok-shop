import { Fingerprint, Layers, PenLine } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'ecrire', href: '/app/studio', label: 'Écrire', icon: PenLine },
  { id: 'serie', href: '/app/studio/serie', label: 'Série de 20', icon: Layers },
  { id: 'style', href: '/app/studio/style', label: 'Mon style', icon: Fingerprint },
] as const;

export type StudioTab = (typeof TABS)[number]['id'];

/** Onglets du studio : écrire, série de 20 vidéos, style personnel. Défilement horizontal sur mobile. */
export function StudioNav({ active, badges = {} }: { active: StudioTab; badges?: Partial<Record<StudioTab, string>> }) {
  return (
    <nav aria-label="Studio" className="scrollbar-none -mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 rounded-2xl border border-line bg-raised p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const current = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors',
                  current ? 'bg-surface text-fg' : 'text-muted hover:bg-surface/60 hover:text-fg',
                )}
              >
                <Icon className={cn('h-4 w-4', current && 'text-cyan-ink')} aria-hidden="true" />
                {tab.label}
                {badges[tab.id] ? <span className="rounded-full bg-cyan-soft px-1.5 py-px text-[0.68rem] font-bold text-cyan-ink">{badges[tab.id]}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
