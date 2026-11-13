import type { Metadata } from 'next';
import { PricingCards } from '@/components/pricing/pricing-cards';
import { SectionHeading } from '@/components/public/section-heading';
import { COACH_FIRST_MONTH_DISCOUNT, getPlan } from '@/lib/plans';
import { pricingCards, yearlyBadge } from '@/lib/pricing';
import { formatEuros } from '@/lib/utils';

const price = (id: 'starter' | 'pro' | 'elite') => formatEuros(getPlan(id).prices.month);

export const metadata: Metadata = {
  title: 'Tarifs',
  description: `Starter à ${price('starter')}, Pro à ${price('pro')}, Elite à ${price('elite')} par mois. Sans engagement, 2 mois offerts à l’année.`,
};

const percent = Math.round(COACH_FIRST_MONTH_DISCOUNT * 100);

const FAQ = [
  {
    q: 'Il y a un plan gratuit ou un essai ?',
    a: 'Non : tout est payant, sans engagement. Tu choisis ton plan juste après l’inscription et tu peux résilier quand tu veux.',
  },
  {
    q: 'Comment je paie ?',
    a: 'Par carte bancaire, via Stripe, une plateforme de paiement sécurisée. Nous ne voyons jamais ton numéro de carte.',
  },
  {
    q: 'Je peux résilier quand je veux ?',
    a: 'Oui, depuis ton compte, en deux clics. Tu gardes l’accès jusqu’à la fin de la période déjà payée.',
  },
  {
    q: 'Et le délai de rétractation de 14 jours ?',
    a: 'Il s’applique. Au paiement, tu demandes que ton abonnement démarre tout de suite ; si tu te rétractes dans les 14 jours, tu paies seulement le service déjà fourni, au prorata. Détails dans les CGV.',
  },
  {
    q: 'Mensuel ou annuel ?',
    a: 'L’annuel coûte le prix de 10 mois : 2 mois offerts par rapport à 12 mois en mensuel. Il est payé en une fois pour l’année.',
  },
  {
    q: 'Mon formateur m’a donné un code.',
    a: `Inscris-toi avec son lien ou entre le code pendant l’inscription : tu as −${percent} % sur ton premier mois d’abonnement mensuel, quel que soit le plan.`,
  },
  {
    q: 'Je peux changer de plan ?',
    a: 'Oui, depuis ton compte. Le changement est calculé au prorata par Stripe.',
  },
  {
    q: 'Que veut dire « illimité » ?',
    a: 'Tu n’as pas de quota à surveiller pour un usage normal, même intensif. Une limite de sécurité protège le service contre les abus.',
  },
  {
    q: 'Vous me remboursez si je ne vends rien ?',
    a: 'L’abonnement paie l’outil, pas des résultats : on ne promet aucun chiffre de ventes. Tes ventes dépendent de tes vidéos, de ton audience et du produit.',
  },
];

export default function PrixPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <p className="eyebrow mb-3">Tarifs</p>
        <h1 className="text-4xl/tight font-bold sm:text-5xl/tight">
          Des prix simples,
          <br />
          <span className="text-gradient-live">sans engagement.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted">
          Trois plans pour publier sur les bons produits. Pro est celui qu’on recommande pour publier tous les jours.
        </p>
      </div>
      <div>
        <PricingCards plans={pricingCards()} mode="public" yearlyBadge={yearlyBadge()} />
        <p className="mt-6 text-center text-sm text-muted">Prix TTC en euros. Paiement sécurisé par Stripe. Résiliable en deux clics.</p>
      </div>

      <section className="mx-auto mt-20 max-w-3xl" aria-labelledby="faq-paiement">
        <SectionHeading eyebrow="Paiement" title="Tes questions" accent="sur le paiement." id="faq-paiement" className="mb-10" />
        <dl className="space-y-3">
          {FAQ.map((item) => (
            <div key={item.q} className="rounded-2xl border border-line bg-fg/[0.02] px-6 py-5">
              <dt className="text-[15px] font-semibold text-fg">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
