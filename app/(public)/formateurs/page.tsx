import type { Metadata } from 'next';
import { BarChart3, Gift, Wallet } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { FeatureCard } from '@/components/ui/feature-card';
import { Card } from '@/components/ui/surface';
import { BRAND } from '@/lib/brand';
import { COACH_TRIAL_DAYS, getPlan, REFERRAL_COMMISSION_RATE } from '@/lib/plans';
import { formatEuros } from '@/lib/utils';
import { PartnerForm } from './partner-form';

export const metadata: Metadata = {
  title: 'Formateurs',
  description: `Propose ${BRAND} à tes élèves : 3 mois de Pro offerts pour eux, 30 % de commission récurrente pour toi.`,
};

export default function FormateursPage() {
  const rate = Math.round(REFERRAL_COMMISSION_RATE * 100);
  const months = Math.round(COACH_TRIAL_DAYS / 30);
  const proMonthly = getPlan('pro').prices.month;

  const benefits = [
    {
      icon: Wallet,
      title: `${rate} % de commission récurrente`,
      text: `Sur chaque paiement de chacun de tes élèves, tant qu’il reste abonné. Par exemple, pour un élève en Pro mensuel (${formatEuros(proMonthly)}), tu touches ${rate} % du montant hors taxes, chaque mois.`,
    },
    {
      icon: Gift,
      title: `${months} mois de Pro offerts à tes élèves`,
      text: 'Avec ton code ou ton lien, sans carte bancaire. Ils arrivent sur un radar complet dès le premier jour.',
    },
    {
      icon: BarChart3,
      title: 'Un espace pour les suivre',
      text: 'Inscrits, actifs de la semaine, plans, scripts écrits, produits suivis. Des données agrégées, sans e-mail sans leur accord.',
    },
  ];

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div
        className="pointer-events-none absolute -top-10 right-0 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(254,44,85,0.16) 0%, transparent 65%)' }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <p className="eyebrow mb-3">Formateurs</p>
        <h1 className="text-4xl/tight font-bold sm:text-5xl/tight">
          Propose {BRAND}
          <br />
          <span className="text-gradient-live">à tes élèves.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
          Tu leur apprends TikTok Shop. {BRAND} leur dit chaque matin quoi vendre et leur écrit leurs scripts. Ils produisent plus,
          tu suis leur progression, et tu touches une commission sur leurs abonnements.
        </p>
      </div>

      <ul className="relative mt-16 grid gap-3 md:grid-cols-3">
        {benefits.map(({ icon, title, text }, i) => (
          <Reveal as="li" key={title} delay={i * 0.08} className="h-full">
            <FeatureCard icon={icon} title={title}>
              {text}
            </FeatureCard>
          </Reveal>
        ))}
      </ul>

      <section className="mt-16 grid gap-10 lg:grid-cols-[1fr_1.2fr]" aria-labelledby="demande">
        <div>
          <p className="eyebrow mb-3">Partenariat</p>
          <h2 id="demande" className="text-3xl/tight font-bold sm:text-4xl/tight">
            Demande ton
            <br />
            <span className="text-gradient">partenariat.</span>
          </h2>
          <ol className="mt-6 space-y-4">
            {[
              'Tu remplis ce formulaire.',
              'On te crée un code promo à ton nom (par exemple TONNOM30) et ton lien.',
              'Tu le partages à tes élèves : leur inscription et leurs abonnements te sont rattachés.',
            ].map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-ink/20 bg-cyan-ink/[0.08] text-sm font-bold text-cyan-ink">
                  {i + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <Card className="sm:p-6">
          <PartnerForm />
        </Card>
      </section>
    </div>
  );
}
