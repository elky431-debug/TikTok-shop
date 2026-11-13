import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card } from '@/components/ui/surface';
import { startCheckoutAction } from '@/app/app/passer-pro/actions';
import { requireViewer } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { getRepo } from '@/lib/db';
import { annualOffer } from '@/lib/billing/annual-offer';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { pricingCards } from '@/lib/pricing';
import { formatLongDate } from '@/lib/utils';
import { WelcomeShell } from '../welcome-shell';

export const metadata: Metadata = { title: 'Ton plan' };
export const dynamic = 'force-dynamic';

/** Moment waouh, étape 6 : l'offre Pro (l'annuel mis en avant), ou la confirmation de l'essai offert par le formateur. */
export default async function OffreProPage() {
  const { profile } = await requireViewer('/bienvenue/pro');
  if (!profile.onboarded_at) redirect('/bienvenue');
  const subscription = await getRepo().getActiveSubscription(profile.id);
  const pro = pricingCards().find((c) => c.id === 'pro')!;
  const offer = annualOffer('pro');
  const mode = billingMode();

  if (subscription?.status === 'trialing' || isPaidPlan(profile.plan)) {
    return (
      <WelcomeShell step={6}>
        <h1 className="text-3xl">{subscription?.status === 'trialing' ? 'Tes 3 mois de Pro sont activés' : `Ton plan ${getPlan(profile.plan).name} est actif`}</h1>
        <p className="mt-2 text-muted">
          {subscription?.status === 'trialing' && subscription.trial_end
            ? `Radar complet, score détaillé, 30 scripts par jour et récap Discord, jusqu’au ${formatLongDate(subscription.trial_end.slice(0, 10))}. Aucune carte n’a été demandée.`
            : 'Radar complet, score détaillé et récaps : tout est ouvert.'}
        </p>
        <LinkButton href="/app?bienvenue=essai" size="lg" arrow className="mt-8 w-full">
          Ouvrir mon radar
        </LinkButton>
      </WelcomeShell>
    );
  }

  return (
    <WelcomeShell step={6}>
      <h1 className="text-3xl">Tu veux tout le radar ?</h1>
      <p className="mt-2 text-muted">
        En Gratuit, tu gardes 3 produits du jour et 3 scripts par jour, sans limite de durée. Pro ouvre tout le reste.
      </p>

      <Card className="gradient-border mt-6 bg-[radial-gradient(ellipse_at_top,_rgba(254,44,85,0.12),_transparent_60%)] sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl">Pro</h2>
          <span className="rounded-full border border-rose/40 bg-rose-soft px-3 py-1 text-xs font-semibold text-rose-ink">{offer.badge}</span>
        </div>
        <p className="num mt-3 flex items-baseline gap-1.5 text-3xl font-bold">
          {pro.yearly} <span className="text-sm font-medium text-muted">/ an</span>
        </p>
        <p className="num mt-1 text-sm text-muted">
          soit {pro.yearlyMonthly} par mois · <span className="font-semibold text-gain">{offer.savings} économisés</span> par rapport au mensuel (
          {pro.monthly} / mois)
        </p>
        <ul className="mt-5 space-y-2 text-sm">
          {pro.features.filter((f) => f.included).map((f) => (
            <li key={f.text} className="flex gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-ink" aria-hidden="true" />
              {f.text}
            </li>
          ))}
        </ul>

        {mode === 'disabled' ? (
          <Callout tone="warn" className="mt-6" title="Paiement bientôt disponible">
            Les abonnements ne sont pas encore ouverts sur ce site. Tu peux continuer en Gratuit en attendant.
          </Callout>
        ) : (
          <div className="mt-6 space-y-2">
            <form action={startCheckoutAction}>
              <input type="hidden" name="plan" value="pro" />
              <input type="hidden" name="periode" value="year" />
              <SubmitButton size="lg" className="w-full" pendingLabel="Ouverture du paiement…">
                Passer Pro à l’année
              </SubmitButton>
            </form>
            <form action={startCheckoutAction}>
              <input type="hidden" name="plan" value="pro" />
              <input type="hidden" name="periode" value="month" />
              <SubmitButton variant="outline" size="lg" className="w-full" pendingLabel="Ouverture du paiement…">
                Passer Pro au mois ({pro.monthly})
              </SubmitButton>
            </form>
            <p className="pt-1 text-center text-xs text-muted">
              Sans engagement, résiliable en deux clics. Un code de réduction se saisit sur la page de paiement.
            </p>
          </div>
        )}
      </Card>

      <p className="mt-6 text-center">
        <Link href="/app?bienvenue=1" className="font-semibold text-muted underline underline-offset-4 hover:text-fg">
          Continuer en Gratuit
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-muted">Pas de promesse de ventes : l’outil t’aide à choisir et à produire, le reste dépend de tes vidéos.</p>
    </WelcomeShell>
  );
}
