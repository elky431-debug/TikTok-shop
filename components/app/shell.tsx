'use client';

import {
  Bell,
  BellRing,
  CalendarDays,
  Clapperboard,
  Columns3,
  Gift,
  GraduationCap,
  Handshake,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Radar,
  ScanSearch,
  Search,
  Shield,
  Sprout,
  Sunrise,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogoMark } from '@/components/brand/logo';
import { BRAND_SPLIT } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * Coque de l'appli, reprise de l'interface d'EtSmart (src/app/dashboard/page.tsx) :
 * - ordinateur : barre latérale fixe, repliée à 64 px (icônes), dépliée à 256 px au survol ou au clavier
 *   (transition de largeur 300 ms ease-out), liens regroupés en sections, élément actif en dégradé, bloc utilisateur
 *   et bouton d'abonnement en bas ; barre haute de 44 px (notifications, plan) ;
 * - téléphone : en-tête fixe de 64 px avec menu déroulant (hauteur animée 200 ms) et barre du bas de 5 onglets.
 * Seules différences : la palette TikTok (dégradé cyan → rose, texte noir sur le dégradé pour le contraste AA), le
 * logo et les textes de Tracktout.
 */
const ICONS = {
  dashboard: LayoutDashboard,
  radar: Radar,
  recherche: Search,
  alertes: BellRing,
  comparer: Columns3,
  studio: Clapperboard,
  analyse: ScanSearch,
  plan: CalendarDays,
  produits: ListChecks,
  gains: Wallet,
  offres: Handshake,
  recap: Sunrise,
  parrainage: Gift,
  preparation: Sprout,
  compte: UserRound,
  formateur: GraduationCap,
  eleve: Users,
  admin: Shield,
  notifications: Bell,
};

export type NavIcon = keyof typeof ICONS;

export interface NavLink {
  href: string;
  label: string;
  icon: NavIcon;
}

export interface NavSection {
  label: string;
  items: NavLink[];
}

export interface ShellUser {
  firstName: string;
  initial: string;
  planName: string;
  paid: boolean;
  unread: number;
}

/** Le tableau de bord n'est actif que sur /app exactement ; le radar couvre aussi les fiches produit. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app';
  if (href === '/app/radar') return pathname === '/app/radar' || pathname.startsWith('/app/produit');
  return pathname === href || pathname.startsWith(`${href}/`);
}

const itemBase =
  'relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan';
const itemActive = 'bg-gradient-to-r from-[#25F4EE] to-[#FE2C55] font-semibold text-black';
const itemIdle = 'bg-transparent text-fg/70 hover:bg-fg/5 hover:text-fg';
/** Libellé qui apparaît quand la barre se déplie (survol ou focus clavier), comme sur EtSmart. */
const reveal =
  'whitespace-nowrap opacity-0 -translate-x-1 transition-all delay-75 duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100';

function SidebarLink({ item, pathname }: { item: NavLink; pathname: string }) {
  const Icon = ICONS[item.icon];
  const active = isActivePath(pathname, item.href);
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={cn(itemBase, active ? itemActive : itemIdle)}>
      <Icon size={20} className="shrink-0" aria-hidden="true" />
      <span className={reveal}>{item.label}</span>
    </Link>
  );
}

export function AppSidebar({ sections, user }: { sections: NavSection[]; user: ShellUser }) {
  const pathname = usePathname();
  return (
    <aside className="group fixed left-0 top-0 z-40 hidden h-screen shrink-0 flex-col bg-bg lg:flex" aria-label="Navigation de l’appli">
      <div className="relative flex h-full min-h-0 w-16 min-w-0 flex-col overflow-hidden border-r border-line-strong bg-bg transition-[width] duration-300 ease-out group-focus-within:w-64 group-hover:w-64">
        {/* Logo */}
        <div className="shrink-0 border-b border-line-strong p-4">
          <Link href="/app" className="flex items-center gap-3" aria-label="Tracktout, tableau de bord">
            <LogoMark size={28} />
            <span className={cn(reveal, 'text-lg font-bold tracking-tight')}>
              {BRAND_SPLIT[0]}
              <span className="text-gradient">{BRAND_SPLIT[1]}</span>
            </span>
          </Link>
        </div>

        {/* Sections */}
        <nav className="dashboard-sidebar-scroll flex min-h-0 flex-1 flex-col space-y-2.5 overflow-y-auto overflow-x-hidden p-2">
          {sections.map((section, index) => (
            <div key={section.label} className={cn('space-y-1 py-0.5', index === 0 && 'border-b border-line-strong pb-2')}>
              {index > 0 ? (
                <div className="max-h-0 overflow-hidden px-3 py-0 opacity-0 transition-all duration-300 group-focus-within:max-h-10 group-focus-within:py-1.5 group-focus-within:opacity-100 group-hover:max-h-10 group-hover:py-1.5 group-hover:opacity-100">
                  <span className="text-xs font-semibold uppercase tracking-wider text-fg/50">{section.label}</span>
                </div>
              ) : null}
              {section.items.map((item) => (
                <SidebarLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ))}
        </nav>

        {/* Bloc utilisateur et abonnement */}
        <div className="shrink-0 space-y-1 border-t border-line-strong bg-bg p-2">
          <Link href="/app/compte" className={cn(itemBase, itemIdle)}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#25F4EE] to-[#FE2C55] text-[11px] font-bold text-black" aria-hidden="true">
              {user.initial}
            </span>
            <span className={cn(reveal, 'flex min-w-0 items-center gap-2')}>
              <span className="truncate text-fg">{user.firstName}</span>
              <span className="rounded-full border border-line-strong px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fg/70">{user.planName}</span>
            </span>
          </Link>
          {!user.paid ? (
            <Link href="/app/passer-pro" className={cn(itemBase, 'text-rose-ink hover:bg-rose/10')}>
              <Sparkle />
              <span className={reveal}>Passer Pro</span>
            </Link>
          ) : null}
          <form action="/auth/deconnexion" method="post">
            <button type="submit" className={cn(itemBase, itemIdle)}>
              <LogOut size={20} className="shrink-0" aria-hidden="true" />
              <span className={reveal}>Me déconnecter</span>
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} className="shrink-0" aria-hidden="true">
      <path d="M12 2.5 14.2 9.8 21.5 12 14.2 14.2 12 21.5 9.8 14.2 2.5 12 9.8 9.8Z" fill="currentColor" />
    </svg>
  );
}

/** Barre haute sur ordinateur (44 px), comme le bandeau des crédits d'EtSmart : notifications et plan. */
export function AppTopBar({ user }: { user: ShellUser }) {
  return (
    <div className="z-30 hidden h-11 shrink-0 items-center justify-end gap-3 border-b border-line-strong bg-bg/95 px-4 backdrop-blur-sm lg:flex lg:px-6">
      <NotificationsLink unread={user.unread} />
      <PlanBadge user={user} />
    </div>
  );
}

function NotificationsLink({ unread }: { unread: number }) {
  return (
    <Link
      href="/app/notifications"
      className="relative rounded-lg p-2 text-fg/70 transition-colors hover:bg-fg/5 hover:text-fg"
      aria-label={unread ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}
    >
      <Bell size={18} aria-hidden="true" />
      {unread ? (
        <span className="num absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-fill px-1 text-[10px] font-bold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  );
}

function PlanBadge({ user, compact }: { user: ShellUser; compact?: boolean }) {
  return user.paid ? (
    <span className="inline-flex items-center rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-semibold text-cyan-ink">
      {user.planName}
    </span>
  ) : (
    <Link
      href="/app/passer-pro"
      className={cn(
        'inline-flex items-center rounded-full bg-rose-fill font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(254,44,85,0.6)]',
        compact ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-xs',
      )}
    >
      Passer Pro
    </Link>
  );
}

/** En-tête mobile fixe (64 px) avec menu déroulant en sections, comme EtSmart. */
export function AppMobileHeader({ sections, user }: { sections: NavSection[]; user: ShellUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div className="fixed left-0 right-0 top-0 z-50 border-b border-line-strong bg-bg lg:hidden">
      <div className="flex h-16 items-center justify-between gap-2 px-4">
        <Link href="/app" className="flex min-w-0 items-center gap-2" aria-label="Tracktout, tableau de bord">
          <LogoMark size={28} />
          <span className="text-lg font-bold tracking-tight">
            {BRAND_SPLIT[0]}
            <span className="text-gradient">{BRAND_SPLIT[1]}</span>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          <NotificationsLink unread={user.unread} />
          <PlanBadge user={user} compact />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg p-2 text-fg/70 hover:bg-fg/5 hover:text-fg"
            aria-expanded={open}
            aria-controls="menu-appli"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          >
            {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open ? (
          <motion.div
            id="menu-appli"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-line-strong bg-bg"
          >
            <nav className="space-y-6 overflow-y-auto p-4" style={{ maxHeight: 'calc(100dvh - 72px)' }} aria-label="Navigation de l’appli">
              {sections.map((section) => (
                <div key={section.label} className="space-y-2">
                  <div className="px-2 py-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-fg/50">{section.label}</span>
                  </div>
                  {section.items.map((item) => {
                    const Icon = ICONS[item.icon];
                    const active = isActivePath(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(itemBase, 'px-4 py-3', active ? itemActive : itemIdle)}
                      >
                        <Icon size={20} className="shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
              <form action="/auth/deconnexion" method="post" className="border-t border-line-strong pt-4">
                <button type="submit" className={cn(itemBase, 'px-4 py-3', itemIdle)}>
                  <LogOut size={20} className="shrink-0" aria-hidden="true" />
                  <span>Me déconnecter</span>
                </button>
              </form>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Barre du bas sur téléphone (64 px, 5 onglets), onglet actif en cyan avec un trait en dégradé, comme EtSmart. */
export function AppBottomNav({ items }: { items: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="safe-bottom fixed bottom-0 left-0 right-0 z-50 flex h-16 items-stretch border-t border-line-strong bg-bg/95 backdrop-blur-md lg:hidden"
      aria-label="Raccourcis"
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors',
              active ? 'text-cyan-ink' : 'text-fg/60 hover:text-fg/80',
            )}
          >
            <Icon size={22} aria-hidden="true" />
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
            {active ? <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#25F4EE] to-[#FE2C55]" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
