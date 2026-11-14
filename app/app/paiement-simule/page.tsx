import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { getRepo } from '@/lib/db';
import { getPlan, isBillingInterval, parsePaidPlan } from '@/lib/plans';
import { formatEuros, formatLongDate } from '@/lib/utils';
import { cancelSimulatedSubscription, confirmSimulatedPayment } from './actions';

export const metadata: Metadata = { title: 'Paiement simulé' };

export default async function PaiementSimulePage({
  searchParams,
}: {
  searchParams: { plan?: string; periode?: string; mode?: string };
}) {
  if (billingMode() !== 'simulation') redirect('/app/passer-pro');
  const { profile } = await requireOnboardedViewer('/app/passer-pro', { abonnement: false });

  if (searchParams.mode === 'portail') {
    const sub = await getRepo().getActiveSubscription(profile.id);
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader eyebrow="Compte" title="Portail d’abonnement (simulé)" description="En production, cette page est le portail client Stripe." />
        <Card className="space-y-4">
          {sub ? (
            <>
              <p>
                Plan <strong>{getPlan(sub.plan).name}</strong>, statut <strong>{sub.status === 'trialing' ? 'essai' : 'actif'}</strong>
                {sub.current_period_end ? ` jusqu’au ${formatLongDate(sub.current_period_end.slice(0, 10))}` : ''}.
              </p>
              <form action={cancelSimulatedSubscription}>
                <SubmitButton variant="danger" pendingLabel="Résiliation…">
                  Résilier mon abonnement
                </SubmitButton>
              </form>
            </>
          ) : (
            <p>Aucun abonnement en cours.</p>
          )}
          <LinkButton href="/app/compte" variant="ghost">
            Retour à mon compte
          </LinkButton>
        </Card>
      </div>
    );
  }

  const plan = parsePaidPlan(searchParams.plan) ?? 'pro';
  const interval = isBillingInterval(searchParams.periode) ? searchParams.periode : 'month';
  const details = getPlan(plan);
  const back = getPlan(profile.plan).access ? '/app/passer-pro' : '/abonnement';

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader eyebrow="Compte" title="Paiement simulé" description="Mode local : aucune clé Stripe n’est configurée." />
      <Callout tone="cyan" className="mb-4" title="Aucune carte, aucun prélèvement">
        Ce paiement passe par le même traitement que les webhooks Stripe : ton plan, ton formateur et ses commissions sont mis à
        jour comme en vrai.
      </Callout>
      <Card>
        <p className="text-sm text-muted">Tu choisis</p>
        <p className="mt-1 text-2xl font-semibold">
          {details.name} · <span className="num">{formatEuros(details.prices[interval])}</span>
          <span className="text-base font-medium text-muted"> / {interval === 'year' ? 'an' : 'mois'}</span>
        </p>
        <form action={confirmSimulatedPayment} className="mt-6">
          <input type="hidden" name="plan" value={plan} />
          <input type="hidden" name="periode" value={interval} />
          <SubmitButton size="lg" className="w-full" pendingLabel="Simulation du paiement…">
            Simuler le paiement
          </SubmitButton>
        </form>
        <LinkButton href={back} variant="ghost" className="mt-2 w-full">
          Annuler
        </LinkButton>
      </Card>
    </div>
  );
}
