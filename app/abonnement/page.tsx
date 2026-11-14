import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { MotionProvider } from '@/components/app/motion-provider';
import { PricingCards } from '@/components/pricing/pricing-cards';
import { Callout } from '@/components/ui/surface';
import { requireViewer } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { COACH_FIRST_MONTH_DISCOUNT, getPlan } from '@/lib/plans';
import { pricingCards, yearlyBadge } from '@/lib/pricing';
import { startCheckoutAction } from '@/app/app/passer-pro/actions';

export const metadata: Metadata = { title: 'Choisis ton abonnement', robots: { index: false } };
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  indisponible: 'Le paiement n’est pas encore activé sur ce site. Aucun prélèvement n’a été fait. Réessaie plus tard.',
  ouverture: 'La page de paiement n’a pas pu s’ouvrir. Aucun prélèvement n’a été fait. Réessaie dans un instant.',
  plan: 'Ce plan n’existe pas. Choisis-en un ci-dessous.',
  demarrage: 'Coche la case de démarrage immédiat pour lancer ton abonnement : sans elle, rien n’est lancé.',
};

/**
 * Étape obligatoire après l'inscription (et l'onboarding) : tout est payant, l'appli ne s'ouvre qu'avec un abonnement.
 * Pro est mis en avant. Un abonné qui arrive ici est renvoyé vers le changement de plan dans l'appli.
 */
export default async function AbonnementPage({ searchParams }: { searchParams: { erreur?: string; paiement?: string; bienvenue?: string } }) {
  const { profile } = await requireViewer('/abonnement');
  if (!profile.onboarded_at || (profile.onboarding_version ?? 1) < 2) redirect('/bienvenue');
  if (getPlan(profile.plan).access) redirect('/app/passer-pro');

  const mode = billingMode();
  const percent = Math.round(COACH_FIRST_MONTH_DISCOUNT * 100);

  return (
    <MotionProvider>
      <div className="min-h-dvh bg-bg">
        <header className="border-b border-line">
          <div className="flex h-16 items-center justify-between px-4 lg:px-8">
            <Logo href="/abonnement" />
            <form action="/auth/deconnexion" method="post">
              <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-fg/5 hover:text-fg">
                Me déconnecter
              </button>
            </form>
          </div>
        </header>

        <main id="contenu" className="px-4 pb-16 pt-10 sm:pt-14 lg:px-8">
          <div className="mb-10 max-w-3xl">
            <p className="eyebrow mb-3">{searchParams.bienvenue ? 'Dernière étape' : 'Abonnement'}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {profile.first_name ? `${profile.first_name}, choisis` : 'Choisis'} ton abonnement
            </h1>
            <p className="mt-3 text-muted">
              Ton radar est prêt. Choisis ton plan pour ouvrir l’appli : sans engagement, tu résilies quand tu veux depuis ton
              compte.
            </p>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-3 empty:hidden lg:grid-cols-2">
            {searchParams.erreur ? (
              <Callout tone="rose" title="Paiement non lancé">
                {ERRORS[searchParams.erreur] ?? ERRORS.ouverture}
              </Callout>
            ) : null}
            {searchParams.paiement === 'annule' ? (
              <Callout tone="neutral" title="Paiement annulé">
                Rien n’a été prélevé. Tu peux reprendre quand tu veux.
              </Callout>
            ) : null}
            {mode === 'disabled' ? (
              <Callout tone="warn" title="Paiement bientôt disponible">
                Les abonnements ne sont pas encore ouverts sur ce site. Aucun prélèvement n’est possible pour le moment.
              </Callout>
            ) : null}
            {mode === 'simulation' ? (
              <Callout tone="cyan" title="Mode local : paiement simulé">
                Aucune clé Stripe n’est configurée. Le paiement est simulé, sans carte ni prélèvement, pour tester le parcours.
              </Callout>
            ) : null}
            {profile.coach_id ? (
              <Callout tone="gain" title={`Code formateur : −${percent} % sur ton premier mois`}>
                Saisis le code promo de ton formateur dans le champ « code promotionnel » de la page de paiement : la remise
                s’affiche avant que tu paies (abonnement mensuel).
              </Callout>
            ) : null}
          </div>

          <PricingCards
            plans={pricingCards()}
            mode="app"
            currentPlan={profile.plan}
            action={startCheckoutAction}
            yearlyBadge={yearlyBadge()}
          />

          <p className="mt-8 text-sm text-muted">
            Prix TTC en euros. Paiement sécurisé par Stripe. Pas de promesse de ventes : l’outil t’aide à choisir et à
            produire, le reste dépend de tes vidéos.
          </p>
          <p className="mt-3 text-sm text-muted">
            <Link href="/app/compte" className="font-semibold text-fg underline decoration-fg/30 underline-offset-2 hover:decoration-fg">
              Mon compte
            </Link>{' '}
            · <Link href="/cgv" className="font-semibold text-fg underline decoration-fg/30 underline-offset-2 hover:decoration-fg">CGV</Link>
          </p>
        </main>
      </div>
    </MotionProvider>
  );
}
