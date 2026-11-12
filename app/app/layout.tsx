import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { BottomNav, SidebarNav, type NavItem } from '@/components/app/nav';
import { LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/surface';
import { getCoachForViewer, requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan, isPaidPlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await requireOnboardedViewer();
  const { profile } = viewer;
  const coach = await getCoachForViewer(viewer.user.id);

  // « Dernière connexion » pour l'espace formateur, mise à jour au plus toutes les 30 minutes.
  const lastSeen = profile.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
  if (Date.now() - lastSeen > 30 * 60_000) {
    await getRepo().updateProfile(profile.id, { last_seen_at: new Date().toISOString() });
  }

  const items: NavItem[] = [
    { href: '/app', label: 'Radar', icon: 'radar', mobile: true },
    { href: '/app/studio', label: 'Studio', icon: 'studio', mobile: true },
    { href: '/app/mes-produits', label: 'Mes produits', icon: 'produits', mobile: true },
    { href: '/app/recap', label: 'Récap', icon: 'recap', mobile: true },
    { href: '/app/parrainage', label: 'Parrainage', icon: 'parrainage' },
    { href: '/app/compte', label: 'Compte', icon: 'compte', mobile: true },
  ];
  if (coach) items.push({ href: '/formateur', label: 'Espace formateur', icon: 'formateur' });
  if (viewer.isAdmin) items.push({ href: '/admin', label: 'Admin', icon: 'admin' });

  const plan = getPlan(profile.plan);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_1fr]">
      {/* Halo très léger en haut de page (pas de constellation dans l'appli) */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-72"
        style={{ background: 'radial-gradient(ellipse 60% 100% at 30% 0%, rgba(37,244,238,0.06), transparent 70%), radial-gradient(ellipse 50% 100% at 80% 0%, rgba(254,44,85,0.05), transparent 70%)' }}
        aria-hidden="true"
      />
      <aside className="sticky top-0 z-10 hidden h-dvh flex-col border-r border-line bg-bg/60 px-4 py-6 backdrop-blur-xl lg:flex">
        <Logo href="/app" className="px-2" />
        <div className="mt-8 flex-1">
          <SidebarNav items={items} />
        </div>
        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between px-2 text-sm">
            <span className="truncate font-semibold">{profile.first_name}</span>
            <Badge tone={isPaidPlan(profile.plan) ? 'ink' : 'neutral'}>{plan.name}</Badge>
          </div>
          {!isPaidPlan(profile.plan) ? (
            <LinkButton href="/app/passer-pro" size="sm" className="w-full">
              Passer Pro
            </LinkButton>
          ) : null}
          <form action="/auth/deconnexion" method="post">
            <button type="submit" className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:text-fg">
              Me déconnecter
            </button>
          </form>
        </div>
      </aside>

      <div className="relative z-10 min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur-xl lg:hidden">
          <Logo href="/app" />
          <div className="flex items-center gap-2">
            {coach ? (
              <Link href="/formateur" className="text-sm font-semibold text-muted hover:text-fg">
                Formateur
              </Link>
            ) : null}
            {isPaidPlan(profile.plan) ? (
              <Badge tone="ink">{plan.name}</Badge>
            ) : (
              <LinkButton href="/app/passer-pro" size="sm" className="h-8 px-3">
                Passer Pro
              </LinkButton>
            )}
          </div>
        </header>
        <main id="contenu" className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
          {children}
        </main>
      </div>

      <BottomNav items={items} />
    </div>
  );
}
