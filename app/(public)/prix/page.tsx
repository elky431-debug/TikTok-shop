import type { Metadata } from 'next';
import { PricingCards } from '@/components/pricing/pricing-cards';
import { SectionHeading } from '@/components/public/section-heading';
import { COACH_TRIAL_DAYS } from '@/lib/plans';
import { pricingCards } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Prix',
  description: 'Gratuit pour commencer. Pro à 19,90 € par mois, Pro+ à 39,90 € par mois. Sans engagement.',
};

const FAQ = [
  {
    q: 'Comment je paie ?',
    a: 'Par carte bancaire, via Stripe, une plateforme de paiement sécurisée. Nous ne voyons jamais ton numéro de carte.',
  },
  {
    q: 'Je peux résilier quand je veux ?',
    a: 'Oui, depuis ton compte, en deux clics. Tu gardes l’accès jusqu’à la fin de la période déjà payée, puis tu repasses en Gratuit.',
  },
  {
    q: 'Mensuel ou annuel ?',
    a: 'L’annuel revient environ 30 % moins cher que 12 mois en mensuel. Il est payé en une fois pour l’année.',
  },
  {
    q: 'Mon formateur m’a donné un code.',
    a: `Inscris-toi avec son lien ou entre le code pendant l’inscription : tu as ${Math.round(COACH_TRIAL_DAYS / 30)} mois de Pro offerts, sans carte bancaire. À la fin, tu choisis de continuer ou non.`,
  },
  {
    q: 'Je peux changer de plan ?',
    a: 'Oui, depuis ton compte. Le changement est calculé au prorata par Stripe.',
  },
  {
    q: 'Vous me remboursez si je ne vends rien ?',
    a: 'L’abonnement paie l’outil, pas des résultats : on ne promet aucun chiffre de ventes. Commence par le plan Gratuit pour te faire un avis.',
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
        <p className="mx-auto mt-4 max-w-xl text-base text-muted">Commence gratuitement. Passe Pro quand tu publies tous les jours.</p>
      </div>
      <div>
        <PricingCards plans={pricingCards()} mode="public" />
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
