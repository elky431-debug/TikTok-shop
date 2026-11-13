'use client';

import { Bell, BellRing, CalendarDays, Clapperboard, Columns3, Gift, GraduationCap, Handshake, ListChecks, Radar, ScanSearch, Search, Shield, Sprout, Sunrise, UserRound, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ICONS = {
  radar: Radar,
  studio: Clapperboard,
  produits: ListChecks,
  recap: Sunrise,
  parrainage: Gift,
  plan: CalendarDays,
  preparation: Sprout,
  recherche: Search,
  alertes: BellRing,
  comparer: Columns3,
  notifications: Bell,
  gains: Wallet,
  offres: Handshake,
  analyse: ScanSearch,
  compte: UserRound,
  formateur: GraduationCap,
  admin: Shield,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  mobile?: boolean;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app' || pathname.startsWith('/app/produit');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.95rem] font-medium transition-colors',
              active ? 'bg-surface font-semibold text-fg' : 'text-muted hover:bg-surface/60 hover:text-fg',
            )}
          >
            <Icon className={cn('h-5 w-5', active ? 'text-cyan-ink' : '')} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/80 backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items
          .filter((i) => i.mobile)
          .map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold',
                    active ? 'text-fg' : 'text-muted',
                  )}
                >
                  <Icon className={cn('h-6 w-6', active ? 'text-cyan-ink' : '')} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
