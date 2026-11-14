import type { ReactNode } from "react";
import { MotionProvider } from "@/components/app/motion-provider";
import {
  AppBottomNav,
  AppMobileHeader,
  AppSidebar,
  AppTopBar,
  type NavLink,
  type NavSection,
  type ShellUser,
} from "@/components/app/shell";
import { getCoachForViewer, requireOnboardedViewer } from "@/lib/auth/session";
import { getRepo } from "@/lib/db";
import { countUnreadNotifications } from "@/lib/notification-center";
import { getPlan, isPaidPlan } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Coque de l'appli au modèle d'EtSmart : barre latérale repliable en sections (ordinateur), en-tête et barre du bas
 * (téléphone), contenu sur fond noir décalé de la barre repliée (64 px).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await requireOnboardedViewer("/app", { abonnement: false });
  const { profile } = viewer;
  const coach = await getCoachForViewer(viewer.user.id);

  // « Dernière connexion » pour l'espace formateur, mise à jour au plus toutes les 30 minutes.
  const lastSeen = profile.last_seen_at
    ? new Date(profile.last_seen_at).getTime()
    : 0;
  if (Date.now() - lastSeen > 30 * 60_000) {
    await getRepo().updateProfile(profile.id, {
      last_seen_at: new Date().toISOString(),
    });
  }

  const unread = await countUnreadNotifications(profile.id);
  const plan = getPlan(profile.plan);
  const accountItems: NavLink[] = [
    { href: "/app/recap", label: "Récap", icon: "recap" },
    ...(profile.eligibility === "preparation"
      ? [
          {
            href: "/app/preparation",
            label: "Préparation",
            icon: "preparation",
          } as NavLink,
        ]
      : []),
    ...(profile.coach_id
      ? [
          {
            href: "/app/consentement-formateur",
            label: "Mon formateur",
            icon: "eleve",
          } as NavLink,
        ]
      : []),
    { href: "/app/compte", label: "Compte", icon: "compte" },
    ...(coach
      ? [
          {
            href: "/formateur",
            label: "Espace formateur",
            icon: "formateur",
          } as NavLink,
        ]
      : []),
    ...(viewer.isAdmin
      ? [{ href: "/admin", label: "Admin", icon: "admin" } as NavLink]
      : []),
  ];
  const sections: NavSection[] = [
    {
      label: "Accueil",
      items: [
        { href: "/app", label: "Dashboard", icon: "dashboard" },
        { href: "/app/lancer", label: "Lancer un produit", icon: "lancer" },
      ],
    },
    {
      label: "Trouver",
      items: [
        { href: "/app/radar", label: "Radar", icon: "radar" },
        { href: "/app/recherche", label: "Recherche", icon: "recherche" },
        { href: "/app/alertes", label: "Alertes", icon: "alertes" },
        { href: "/app/comparer", label: "Comparer", icon: "comparer" },
      ],
    },
    {
      label: "Créer",
      items: [
        { href: "/app/studio", label: "Studio", icon: "studio" },
        { href: "/app/analyse", label: "Analyse de vidéo", icon: "analyse" },
        { href: "/app/plan", label: "Plan de publication", icon: "plan" },
      ],
    },
    {
      label: "Suivre",
      items: [
        { href: "/app/mes-produits", label: "Mes produits", icon: "produits" },
        {
          href: "/app/offres",
          label: "Propositions de marques",
          icon: "offres",
        },
      ],
    },
    { label: "Compte", items: accountItems },
  ];
  // Sans abonnement (pages compte et paiement seulement) : rien d'autre à ouvrir que le compte.
  if (!plan.access) sections.splice(0, sections.length, { label: "Compte", items: accountItems.filter((i) => i.href === "/app/compte" || i.href === "/formateur" || i.href === "/admin") });
  const shortcuts: NavLink[] = !plan.access ? [{ href: "/app/compte", label: "Compte", icon: "compte" }] : [
    { href: "/app", label: "Dashboard", icon: "dashboard" },
    { href: "/app/lancer", label: "Lancer", icon: "lancer" },
    { href: "/app/radar", label: "Radar", icon: "radar" },
    { href: "/app/studio", label: "Studio", icon: "studio" },
    { href: "/app/mes-produits", label: "Produits", icon: "produits" },
  ];
  const user: ShellUser = {
    firstName: profile.first_name ?? "Mon compte",
    initial:
      (profile.first_name ?? profile.email).trim().charAt(0).toUpperCase() ||
      "?",
    planName: plan.name,
    paid: isPaidPlan(profile.plan),
    unread,
  };

  return (
    <MotionProvider>
      <div className="flex min-h-dvh bg-bg">
        <AppSidebar sections={sections} user={user} />
        <AppMobileHeader sections={sections} user={user} />
        <main
          id="contenu"
          className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg pb-16 pt-16 lg:ml-16 lg:pb-0 lg:pt-0"
        >
          <AppTopBar user={user} />
          {/* Pleine largeur : marges de 16 px sur téléphone, 32 px sur ordinateur ; les textes longs gardent leur largeur de lecture. */}
          <div className="w-full flex-1 px-4 py-4 sm:py-6 md:py-8 lg:px-8">
            {children}
          </div>
        </main>
        <AppBottomNav items={shortcuts} />
      </div>
    </MotionProvider>
  );
}
