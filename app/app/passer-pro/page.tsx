import type { Metadata } from 'next';
import { CalendarCheck, Repeat, Ticket } from 'lucide-react';
import { PricingCards } from '@/components/pricing/pricing-cards';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { annualOffer } from '@/lib/billing/annual-offer';
import { getRepo } from '@/lib/db';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { pricingCards } from '@/lib/pricing';
import { formatEuros, formatLongDate } from '@/lib/utils';
import { startCheckoutAction } from './actions';

export const metadata: Metadata = { title: 'Passer Pro' };

const ERRORS: Record<string, string> = {
  indisponible: 'Le paiement n’est pas encore activé sur ce site. Aucun prélèvement n’a été fait. Réessaie plus tard.',
  ouverture: 'La page de paiement n’a pas pu s’ouvrir. Aucun prélèvement n’a été fait. Réessaie dans un instant.',
  plan: 'Ce plan n’existe pas. Choisis-en un ci-dessous.',
};

export default async function PasserProPage({ searchParams }: { searchParams: { erreur?: string; paiement?: string } }) {
  const { profile } = await requireOnboardedViewer('/app/passer-pro');
  const mode = billingMode();
  const active = await getRepo().getActiveSubscription(profile.id);
  const proOffer = annualOffer('pro');
  const plusOffer = annualOffer('proplus');
  const subscribed = Boolean(active && isPaidPlan(active.plan) && active.status !== 'trialing');
  const currentPaid = active && isPaidPlan(active.plan) ? (active.plan as 'pro' | 'proplus') : null;
  const monthly = active?.billing_interval === 'month' && currentPaid && active.status !== 'trialing';

  return (
    <div>
      <PageHeader eyebrow="Compte"
        title="Choisis ton plan"
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
            Les abonnements ne sont pas encore ouverts sur ce site. Tu peux continuer en Gratuit en attendant.
          </Callout>
        ) : null}
        {mode === 'simulation' ? (
          <Callout tone="cyan" title="Mode local : paiement simulé">
            Aucune clé Stripe n’est configurée. Le paiement est simulé, sans carte ni prélèvement, pour tester le parcours.
          </Callout>
        ) : null}
        {active?.status === 'trialing' && active.trial_end ? (
          <Callout tone="gain" title="Tu es en essai Pro">
            Ton essai offert court jusqu’au {formatLongDate(active.trial_end.slice(0, 10))}. Choisis un plan ci-dessous pour continuer
            ensuite : Stripe te montre le montant exact avant de confirmer.
          </Callout>
        ) : null}
        {!subscribed ? (
          <Callout tone="gain" icon={<CalendarCheck className="h-5 w-5 text-gain" aria-hidden="true" />} title={`À l’année : ${proOffer.badge.toLowerCase()}`}>
            Pro à {formatEuros(getPlan('pro').prices.year, { round: true })} par an au lieu de {formatEuros(getPlan('pro').prices.month * 12)} en payant
            au mois : {proOffer.savings} économisés (−{proOffer.percent} %). Pro+ : {plusOffer.savings} économisés. La période « Annuel » est
            choisie par défaut ci-dessous.
          </Callout>
        ) : null}
      </div>

      <PricingCards plans={pricingCards()} mode="app" currentPlan={profile.plan} action={startCheckoutAction} defaultInterval="year" />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {currentPaid && active?.status !== 'trialing' ? (
          <Card id="changer">
            <h2 className="flex items-center gap-2 text-lg">
              <Repeat className="h-5 w-5 text-cyan-ink" aria-hidden="true" /> Changer de plan
            </h2>
            <p className="mt-2 text-sm text-muted">
              Tu es en {getPlan(currentPaid).name}
              {active?.billing_interval === 'year' ? ', à l’année' : active?.billing_interval === 'month' ? ', au mois' : ''}. Choisis un autre plan
              ci-dessus : pas de second abonnement, ton abonnement actuel change de prix. {mode === 'stripe' ? 'Stripe' : 'Le portail'} affiche le
              montant au prorata (ce qui reste de ta période est déduit) avant que tu confirmes.
            </p>
            {monthly && mode !== 'disabled' ? (
              <form action={startCheckoutAction} className="mt-4">
                <input type="hidden" name="plan" value={currentPaid} />
                <input type="hidden" name="periode" value="year" />
                <SubmitButton variant="outline" size="sm" pendingLabel="Ouverture…">
                  Passer à l’annuel ({annualOffer(currentPaid).savings} économisés)
                </SubmitButton>
              </form>
            ) : null}
          </Card>
        ) : null}
        <Card id="code">
          <h2 className="flex items-center gap-2 text-lg">
            <Ticket className="h-5 w-5 text-cyan-ink" aria-hidden="true" /> Un code de réduction ?
          </h2>
          <p className="mt-2 text-sm text-muted">
            Choisis ton plan, puis saisis ton code dans le champ « code promotionnel » de la page de paiement sécurisée Stripe : la
            réduction s’affiche avant que tu paies. Un code vaut pour un nouvel abonnement.
          </p>
          {mode === 'simulation' ? <p className="mt-2 text-xs text-muted">Mode local : le paiement simulé n’a pas de champ pour les codes.</p> : null}
        </Card>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Prix en euros. Paiement sécurisé par Stripe. Pas de promesse de ventes : l’outil t’aide à choisir et à produire, le reste
        dépend de tes vidéos.
      </p>
    </div>
  );
}
