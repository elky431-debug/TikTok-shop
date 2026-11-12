import type { Metadata } from 'next';
import { PricingCards } from '@/components/pricing/pricing-cards';
import { Callout, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { getRepo } from '@/lib/db';
import { pricingCards } from '@/lib/pricing';
import { formatLongDate } from '@/lib/utils';
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

  return (
    <div>
      <PageHeader
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
            Ton essai offert court jusqu’au {formatLongDate(active.trial_end.slice(0, 10))}. Ajoute un moyen de paiement depuis
            ton compte pour continuer ensuite.
          </Callout>
        ) : null}
      </div>
      <PricingCards plans={pricingCards()} mode="app" currentPlan={profile.plan} action={startCheckoutAction} />
      <p className="mt-6 text-center text-sm text-muted">
        Prix en euros. Paiement sécurisé par Stripe. Pas de promesse de ventes : l’outil t’aide à choisir et à produire, le reste
        dépend de tes vidéos.
      </p>
    </div>
  );
}
