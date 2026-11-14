import type { Metadata } from 'next';
import {
  BellRing,
  Check,
  Clapperboard,
  Gauge,
  HandCoins,
  ListChecks,
  Radar,
  Sunrise,
} from 'lucide-react';
import { CountUp } from '@/components/motion/count-up';
import { Reveal } from '@/components/motion/reveal';
import { PricingCards } from '@/components/pricing/pricing-cards';
import { Constellation } from '@/components/public/constellation';
import { FaqItem } from '@/components/public/faq-item';
import { HeroIntro } from '@/components/public/hero-intro';
import { ScreenshotMarquee } from '@/components/public/screenshot-marquee';
import { SectionHeading } from '@/components/public/section-heading';
import { LinkButton } from '@/components/ui/button';
import { FeatureCard } from '@/components/ui/feature-card';
import { BRAND, BRAND_DESCRIPTION, BRAND_TAGLINE } from '@/lib/brand';
import { COACH_FIRST_MONTH_DISCOUNT, getPlan, REFERRAL_COMMISSION_RATE } from '@/lib/plans';
import { pricingCards, yearlyBadge } from '@/lib/pricing';
import { MARKET_FIGURES } from '@/lib/market';
import { formatEuros } from '@/lib/utils';

export const metadata: Metadata = {
  title: { absolute: `${BRAND_TAGLINE} · ${BRAND}` },
  description: BRAND_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { title: `${BRAND_TAGLINE} · ${BRAND}`, description: BRAND_DESCRIPTION, url: '/' },
  twitter: { card: 'summary_large_image', title: `${BRAND_TAGLINE} · ${BRAND}`, description: BRAND_DESCRIPTION },
};
export const revalidate = 3600;

/** Chiffres vrais sur le produit (Tracktout n'a pas encore d'utilisateurs : aucun chiffre d'usage). */
const STATS = [
  { value: 5, suffix: '', label: 'produits gagnants chaque matin' },
  { value: 10, suffix: '', label: 'accroches par produit' },
  { value: 3, suffix: '', label: 'scripts prêts à tourner' },
  { value: 100, suffix: ' %', label: 'en français' },
];

const FEATURES = [
  {
    category: 'Trouver',
    items: [
      { icon: Radar, title: 'Radar', desc: 'Les produits qui montent dans tes niches, triés par score chaque matin.' },
      {
        icon: Gauge,
        title: 'Score expliqué',
        desc: 'Un score sur 100 avec le pourquoi en phrases : croissance, commission, concurrence, prix.',
      },
      {
        icon: Clapperboard,
        title: 'Vidéos qui vendent',
        desc: 'Pour chaque produit phare, les vidéos qui ont le plus vendu, avec leurs vues et leur durée.',
      },
      { icon: BellRing, title: 'Alertes de baisse', desc: 'Tu sais quand un produit que tu suis commence à retomber.' },
    ],
  },
  {
    category: 'Vendre',
    items: [
      {
        icon: Clapperboard,
        title: 'Studio de scripts',
        desc: '10 accroches et 3 scripts plan par plan, écrits dans ton style, en un clic.',
      },
      {
        icon: Sunrise,
        title: 'Récap du matin',
        desc: 'Tes meilleurs produits et un script prêt, par e-mail ou sur Discord, à l’heure que tu choisis.',
      },
      { icon: ListChecks, title: 'Mes produits', desc: 'Objectif 20 vidéos par produit, et ta progression vidéo après vidéo.' },
      {
        icon: HandCoins,
        title: 'Parrainage',
        desc: `Invite d’autres créateurs : ${Math.round(REFERRAL_COMMISSION_RATE * 100)} % de ce qu’ils paient, chaque mois.`,
      },
    ],
  },
];

const STEPS = [
  {
    title: 'Chaque nuit, on analyse',
    desc: 'Chaque nuit, on passe en revue les produits ouverts à l’affiliation en France : ventes estimées, commission, affiliés, vidéos qui vendent.',
  },
  {
    title: 'Le matin, tu sais quoi vendre',
    desc: 'Ton radar classe les produits de tes niches par score d’opportunité, et te dit pourquoi en phrases simples.',
  },
  {
    title: 'Tu tournes, beaucoup',
    desc: 'En un clic : 10 accroches et 3 scripts dans ton style. Tu suis ton objectif de 20 vidéos par produit.',
  },
];

const FAQ = [
  {
    q: 'Vous vous connectez à mon compte TikTok ?',
    a: 'Jamais. Pas de mot de passe, pas de publication automatique, pas de scraping de ton compte. Les données produits viennent d’API officielles ou de fournisseurs de données.',
  },
  {
    q: 'Je n’ai pas encore 1 500 abonnés.',
    a: 'Tu démarres en mode préparation : tu vois les produits qui montent et tu t’entraînes avec les scripts. Tes vidéos font grandir ton compte en attendant de pouvoir vendre.',
  },
  {
    q: 'Est-ce que je vais gagner de l’argent ?',
    a: 'On ne promet rien. L’outil t’aide à choisir de meilleurs produits et à produire plus de vidéos ; tes ventes dépendent de tes vidéos, de ton audience et du produit.',
  },
  {
    q: 'Les scripts sont-ils prêts à publier ?',
    a: 'Ils sont prêts à tourner. Ils évitent les promesses médicales et les superlatifs, et te rappellent de signaler la collaboration commerciale (#publicité). Relis-les toujours avec ton ton à toi.',
  },
  {
    q: 'Je peux arrêter quand je veux ?',
    a: 'Oui. Sans engagement : tu résilies depuis ton compte en deux clics, et tu gardes l’accès jusqu’à la fin de la période payée.',
  },
];

export default function HomePage() {
  const starterPrice = formatEuros(getPlan('starter').prices.month);

  return (
    <>
      {/* Héros */}
      <section className="relative overflow-hidden pb-20 pt-9">
        <Constellation />
        <HeroIntro
          pill="Le radar TikTok Shop pour les affiliés français"
          title="Automatise ton business TikTok Shop"
          accent="de A à Z."
          subtitle={`${BRAND} trouve les produits qui vont exploser, écrit tes scripts, planifie tes vidéos et suit tes gains. Toi, tu tournes.`}
          actions={
            <>
              <LinkButton href="/connexion" size="lg" arrow>
                Commencer
              </LinkButton>
              <LinkButton href="#comment" variant="outline" size="lg">
                Voir comment ça marche
              </LinkButton>
            </>
          }
          footnote={`Dès ${starterPrice}/mois · Sans engagement`}
        />
      </section>

      {/* Défilé de captures de l'appli (vraies pages, compte de démo : npm run screenshots:landing) */}
      <ScreenshotMarquee />

      {/* Bandeau de chiffres */}
      <section className="border-y border-fg/[0.06] bg-fg/[0.01]" aria-label="Tracktout en chiffres">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <dl className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.08} className="flex flex-col text-center">
                <dt className="order-2 mt-1 text-xs text-muted sm:text-sm">{s.label}</dt>
                <dd className="order-1 text-3xl font-bold sm:text-4xl">
                  <CountUp value={s.value} suffix={s.suffix} className="text-gradient num" />
                </dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* Le marché : trois chiffres publics, chacun avec sa source et sa date */}
      <section id="marche" className="scroll-mt-16 pt-20 sm:pt-28" aria-labelledby="marche-titre">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading id="marche-titre" eyebrow="Le marché" title="TikTok Shop," accent="en trois chiffres." className="mb-12" />
          <ul className="grid gap-3 md:grid-cols-3">
            {MARKET_FIGURES.map((figure, i) => (
              <Reveal as="li" key={figure.value} delay={i * 0.08} className="h-full">
                <figure className="feature-card flex h-full flex-col p-6">
                  <p className="num text-gradient text-3xl font-bold sm:text-4xl">{figure.value}</p>
                  <figcaption className="mt-2 flex flex-1 flex-col">
                    <span className="text-sm font-semibold text-fg">{figure.label}</span>
                    <span className="mt-1 text-sm text-muted">{figure.scope}</span>
                    <span className="mt-4 text-xs text-muted">
                      Source :{' '}
                      <a
                        href={figure.source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-fg underline decoration-fg/30 underline-offset-2 hover:decoration-fg"
                      >
                        {figure.source.name}
                        <span className="sr-only"> (nouvel onglet)</span>
                      </a>
                      , {figure.source.date}
                    </span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Tout-en-un */}
      <section id="fonctionnalites" className="scroll-mt-16 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Tout-en-un"
            title="Un seul outil pour"
            accent="tout automatiser."
            subtitle="Trouver les bons produits, comprendre pourquoi, écrire tes vidéos : tout le travail avant de filmer, fait pour toi."
          />
          {FEATURES.map((group, gi) => (
            <div key={group.category} className={gi > 0 ? 'mt-10' : ''}>
              <Reveal>
                <p className="eyebrow-category mb-4 pl-1">{group.category}</p>
              </Reveal>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {group.items.map((f, i) => (
                  <Reveal key={f.title} delay={gi * 0.05 + i * 0.08} className="h-full">
                    <FeatureCard icon={f.icon} title={f.title}>
                      {f.desc}
                    </FeatureCard>
                  </Reveal>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment" className="relative scroll-mt-16 overflow-hidden py-20 sm:py-28">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-cyan-ink/[0.03] to-transparent" aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
          <SectionHeading eyebrow="Comment ça marche" title="Du radar à la vidéo," accent="en trois étapes." />
          <div className="relative">
            <div className="absolute left-[calc(16.67%+48px)] right-[calc(16.67%+48px)] top-[44px] hidden h-[2px] md:block" aria-hidden="true">
              <div className="h-full w-full rounded-full bg-[image:var(--gradient)] opacity-50" />
              <div className="absolute inset-0 rounded-full bg-[image:var(--gradient)] opacity-30 blur-sm" />
            </div>
            <ol className="relative grid gap-6 md:grid-cols-3 md:gap-8">
              {STEPS.map((step, i) => (
                <Reveal as="li" key={step.title} delay={i * 0.15}>
                  <div className="flex flex-col items-center text-center">
                    <p className="num mb-6 bg-bg px-3 text-7xl font-bold leading-none tracking-tight">
                      <span className="text-gradient">{String(i + 1).padStart(2, '0')}</span>
                    </p>
                    <div className="w-full rounded-2xl border border-line bg-fg/[0.02] p-6 transition-colors hover:border-line-strong hover:bg-fg/[0.03]">
                      <h3 className="mb-2 text-lg font-bold text-fg">{step.title}</h3>
                      <p className="text-sm leading-relaxed text-muted">{step.desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>
            <Reveal className="mt-14 text-center">
              <LinkButton href="/connexion" size="lg" arrow className="shadow-lg shadow-rose/15">
                Commencer
              </LinkButton>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Tarifs */}
      <section id="prix" className="scroll-mt-16 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Tarifs"
            title="Trois plans,"
            accent="Pro pour publier chaque jour."
            subtitle={`Sans engagement, résiliable en deux clics. À l’année, ${yearlyBadge().toLowerCase()}.`}
          />
          <Reveal>
            <PricingCards plans={pricingCards()} mode="public" yearlyBadge={yearlyBadge()} />
          </Reveal>
        </div>
      </section>

      {/* Formateurs */}
      <section className="py-20 sm:py-28" aria-labelledby="formateurs">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-line bg-raised p-8 sm:p-12 md:p-16">
              <div
                className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
                style={{ background: 'radial-gradient(circle, rgb(var(--rose) / 0.22) 0%, transparent 65%)' }}
                aria-hidden="true"
              />
              <div className="relative grid items-center gap-10 md:grid-cols-2">
                <div>
                  <p className="eyebrow mb-3">Formateurs</p>
                  <h2 id="formateurs" className="text-3xl/tight font-bold text-fg sm:text-4xl/tight">
                    Tu es formateur
                    <br />
                    <span className="text-gradient-live">TikTok Shop&nbsp;?</span>
                  </h2>
                  <p className="mt-5 text-base leading-relaxed text-muted">
                    Donne à tes élèves l’outil qui leur dit quoi vendre chaque matin. Tu suis leur progression, et tu touches une
                    commission sur leurs abonnements.
                  </p>
                </div>
                <div>
                  <ul className="space-y-3">
                    {[
                      `${Math.round(REFERRAL_COMMISSION_RATE * 100)} % de commission récurrente sur tes élèves`,
                      `−${Math.round(COACH_FIRST_MONTH_DISCOUNT * 100)} % sur le premier mois pour chacun de tes élèves`,
                      'Un espace pour suivre leur progression',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-3 rounded-xl border border-line bg-bg/40 px-4 py-3 text-sm text-fg/90">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-ink" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <LinkButton href="/formateurs" size="lg" arrow className="mt-6">
                    Devenir partenaire
                  </LinkButton>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 sm:py-28" aria-labelledby="faq">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal className="mb-12 text-center">
            <h2 id="faq" className="mb-2 text-3xl font-bold text-fg sm:text-4xl">
              Questions fréquentes
            </h2>
            <p className="text-sm text-muted">Tout ce qu’il faut savoir avant de commencer.</p>
          </Reveal>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <FaqItem key={item.q} question={item.q} answer={item.a} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
