import type { Metadata } from 'next';
import { CalendarCheck, Repeat } from 'lucide-react';
import { PricingCards } from '@/components/pricing/pricing-cards';
import { Callout, Card, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { annualOffer } from '@/lib/billing/annual-offer';
import { getRepo } from '@/lib/db';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { pricingCards, yearlyBadge } from '@/lib/pricing';
import { startCheckoutAction } from './actions';

export const metadata: Metadata = { title: 'Changer de plan' };

const ERRORS: Record<string, string> = {
  indisponible: 'Le paiement n’est pas encore activé sur ce site. Aucun prélèvement n’a été fait. Réessaie plus tard.',
  ouverture: 'La page de paiement n’a pas pu s’ouvrir. Aucun prélèvement n’a été fait. Réessaie dans un instant.',
  plan: 'Ce plan n’existe pas. Choisis-en un ci-dessous.',
  demarrage: 'Coche la case de démarrage immédiat pour changer de plan : sans elle, rien n’est lancé.',
};

/** Changement de plan pour un abonné (sans abonnement, requireOnboardedViewer renvoie vers /abonnement). */
export default async function PasserProPage({ searchParams }: { searchParams: { erreur?: string; paiement?: string } }) {
  const { profile } = await requireOnboardedViewer('/app/passer-pro');
  const mode = billingMode();
  const active = await getRepo().getActiveSubscription(profile.id);
  const currentPaid = active && isPaidPlan(active.plan) ? active.plan : isPaidPlan(profile.plan) ? profile.plan : null;
  const monthly = active?.billing_interval === 'month';

  return (
    <div>
      <PageHeader
        eyebrow="Compte"
        title="Change de plan"
        description="Sans engagement : tu résilies quand tu veux depuis ton compte, en deux clics."
      />
      <div className="mb-6 space-y-3">
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
            Les changements de plan ne sont pas encore ouverts sur ce site. Aucun prélèvement n’est possible pour le moment.
          </Callout>
        ) : null}
        {mode === 'simulation' ? (
          <Callout tone="cyan" title="Mode local : paiement simulé">
            Aucune clé Stripe n’est configurée. Le paiement est simulé, sans carte ni prélèvement, pour tester le parcours.
          </Callout>
        ) : null}
        {currentPaid && monthly ? (
          <Callout tone="gain" icon={<CalendarCheck className="h-5 w-5 text-gain" aria-hidden="true" />} title={`À l’année : ${annualOffer(currentPaid).badge.toLowerCase()}`}>
            {getPlan(currentPaid).name} à l’année : {annualOffer(currentPaid).savings} économisés par rapport à 12 mois payés au mois.
            Choisis « Annuel » ci-dessous.
          </Callout>
        ) : null}
      </div>

      <PricingCards
        plans={pricingCards()}
        mode="app"
        currentPlan={currentPaid ?? profile.plan}
        action={startCheckoutAction}
        yearlyBadge={yearlyBadge()}
      />

      {currentPaid ? (
        <Card id="changer" className="mt-8">
          <h2 className="flex items-center gap-2 text-lg">
            <Repeat className="h-5 w-5 text-cyan-ink" aria-hidden="true" /> Comment se passe le changement
          </h2>
          <p className="mt-2 text-sm text-muted">
            Tu es en {getPlan(currentPaid).name}
            {active?.billing_interval === 'year' ? ', à l’année' : active?.billing_interval === 'month' ? ', au mois' : ''}. Pas de second
            abonnement : ton abonnement actuel change de prix. {mode === 'stripe' ? 'Stripe' : 'Le portail'} affiche le montant au prorata
            (ce qui reste de ta période est déduit) avant que tu confirmes.
          </p>
        </Card>
      ) : null}

      <p className="mt-6 text-center text-sm text-muted">
        Prix TTC en euros. Paiement sécurisé par Stripe. Pas de promesse de ventes : l’outil t’aide à choisir et à produire, le
        reste dépend de tes vidéos.
      </p>
    </div>
  );
}
