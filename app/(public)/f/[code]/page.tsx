import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Clapperboard, Gauge, Radar, Sunrise } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { LinkButton } from '@/components/ui/button';
import { AnnouncementPill } from '@/components/ui/announcement-pill';
import { FeatureCard } from '@/components/ui/feature-card';
import { BRAND } from '@/lib/brand';
import { COACH_TRIAL_DAYS, getPlan } from '@/lib/plans';
import { describeCode, normalizeCode } from '@/lib/referral';
import { formatEuros } from '@/lib/utils';

/**
 * Page d'accueil co-brandée d'un formateur : /f/CODE (code principal ou supplémentaire actif). Le bouton passe par
 * /r/CODE, qui mémorise le code 30 jours puis ouvre l'inscription : l'élève est rattaché au formateur et à ce code.
 * Pas d'indexation (une page par code : contenu presque identique d'une page à l'autre).
 */
export const revalidate = 600;

async function coachFor(rawCode: string) {
  const code = normalizeCode(decodeURIComponent(rawCode));
  const found = await describeCode(code);
  return found.kind === 'coach' ? { coach: found.coach, code: found.code } : null;
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const found = await coachFor(params.code);
  if (!found) return { title: 'Code introuvable', robots: { index: false, follow: false } };
  const months = Math.round(COACH_TRIAL_DAYS / 30);
  const title = `${found.coach.training_name} t’offre ${months} mois de ${BRAND} Pro`;
  return {
    title,
    description: `Avec le code ${found.code}, ${months} mois de Pro offerts, sans carte bancaire : les produits TikTok Shop qui montent chaque matin et des scripts vidéo prêts à tourner.`,
    robots: { index: false, follow: true },
    openGraph: { title, type: 'website' },
  };
}

export default async function CoachLandingPage({ params }: { params: { code: string } }) {
  const found = await coachFor(params.code);
  if (!found) notFound();
  const { coach, code } = found;
  const months = Math.round(COACH_TRIAL_DAYS / 30);
  const pro = getPlan('pro');
  const signup = `/r/${encodeURIComponent(code)}`;

  const features = [
    { icon: Radar, title: 'Le radar complet', text: 'Chaque matin, les produits TikTok Shop qui montent dans tes niches, classés par score.' },
    { icon: Gauge, title: 'Un score expliqué', text: 'Croissance, commission, concurrence, prix : le pourquoi de chaque score, en phrases.' },
    { icon: Clapperboard, title: 'Tes scripts écrits', text: `${pro.scriptsPerDay} scripts par jour, accroches comprises, dans ton style.` },
    { icon: Sunrise, title: 'Ton récap du matin', text: 'Par e-mail ou sur Discord, à l’heure que tu choisis.' },
  ];

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div
        className="pointer-events-none absolute -top-10 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgb(var(--cyan) / 0.14) 0%, rgb(var(--rose) / 0.10) 45%, transparent 70%)' }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <AnnouncementPill>Proposé par {coach.training_name}</AnnouncementPill>
        <h1 className="mt-6 text-4xl/tight font-bold tracking-tight sm:text-6xl/tight">
          {months} mois de Pro
          <br />
          <span className="text-gradient-live italic">offerts avec {code}.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted">
          {coach.training_name} te propose {BRAND} : chaque matin, les produits TikTok Shop à vendre dans tes niches, et des scripts vidéo
          prêts à tourner. Sans carte bancaire. À la fin des {months} mois, tu choisis de continuer ({formatEuros(pro.prices.month)} par mois)
          ou de rester en Gratuit.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LinkButton href={signup} size="lg" arrow>
            Activer mes {months} mois offerts
          </LinkButton>
          <LinkButton href="/prix" variant="secondary" size="lg">
            Voir ce que contient Pro
          </LinkButton>
        </div>
        <p className="mt-4 text-xs text-muted">Le code {code} est appliqué automatiquement à ton inscription.</p>
      </div>

      <ul className="relative mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon, title, text }, i) => (
          <Reveal as="li" key={title} delay={i * 0.06} className="h-full">
            <FeatureCard icon={icon} title={title}>
              {text}
            </FeatureCard>
          </Reveal>
        ))}
      </ul>

      <p className="relative mx-auto mt-12 max-w-xl text-center text-sm text-muted">
        {BRAND} t’aide à choisir et à produire : il ne promet aucun chiffre de ventes. Les données viennent de sources officielles ou
        de fournisseurs sous contrat, jamais de copie de TikTok.
      </p>
    </div>
  );
}
