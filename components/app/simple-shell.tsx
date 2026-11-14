import type { ReactNode } from 'react';
import { AppBottomNav, AppMobileHeader, AppSidebar, AppTopBar, type NavLink, type NavSection, type ShellUser } from '@/components/app/shell';
import { MotionProvider } from '@/components/app/motion-provider';
import { getCoachForViewer, requireViewer } from '@/lib/auth/session';
import { countUnreadNotifications } from '@/lib/notification-center';
import { getPlan, isPaidPlan } from '@/lib/plans';

/**
 * Coque des espaces formateur et admin : la même que l'appli (barre latérale d'EtSmart), avec les sections de l'espace
 * et un retour à l'appli. Les droits sont vérifiés par chaque page (requireCoach, requireAdmin).
 */
export async function SimpleShell({ children }: { title?: string; children: ReactNode }) {
  const viewer = await requireViewer('/app');
  const { profile } = viewer;
  const [coach, unread] = await Promise.all([getCoachForViewer(viewer.user.id), countUnreadNotifications(profile.id)]);
  const sections: NavSection[] = [{ label: 'Appli', items: [{ href: '/app', label: 'Dashboard', icon: 'dashboard' }, { href: '/app/radar', label: 'Radar', icon: 'radar' }] }];
  if (coach) sections.push({ label: 'Formateur', items: [{ href: '/formateur', label: 'Mes élèves', icon: 'formateur' }] });
  if (viewer.isAdmin) {
    sections.push({
      label: 'Administration',
      items: [
        { href: '/admin', label: 'Aperçu', icon: 'admin' },
        { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: 'eleve' },
        { href: '/admin/formateurs', label: 'Formateurs et versements', icon: 'formateur' },
      ],
    });
  }
  const shortcuts: NavLink[] = sections.flatMap((s) => s.items).slice(0, 5);
  const plan = getPlan(profile.plan);
  const user: ShellUser = {
    firstName: profile.first_name ?? 'Mon compte',
    initial: (profile.first_name ?? profile.email).trim().charAt(0).toUpperCase() || '?',
    planName: plan.name,
    paid: isPaidPlan(profile.plan),
    unread,
  };
  return (
    <MotionProvider>
      <div className="flex min-h-dvh bg-bg">
        <AppSidebar sections={sections} user={user} />
        <AppMobileHeader sections={sections} user={user} />
        <main id="contenu" className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg pb-16 pt-16 lg:ml-16 lg:pb-0 lg:pt-0">
          <AppTopBar user={user} />
          <div className="w-full flex-1 px-4 py-4 sm:py-6 md:py-8 lg:px-8">{children}</div>
        </main>
        <AppBottomNav items={shortcuts} />
      </div>
    </MotionProvider>
  );
}
