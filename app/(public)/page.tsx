import type { Metadata } from 'next';
import { Check, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { PricingCards } from '@/components/pricing/pricing-cards';
import { HeroPreview } from '@/components/public/hero-preview';
import { LinkButton } from '@/components/ui/button';
import { Callout } from '@/components/ui/surface';
import { formatLabel, SCRIPT_FORMATS } from '@/lib/ai/formats';
import { BRAND, BRAND_TAGLINE } from '@/lib/brand';
import { nicheShort } from '@/lib/niches';
import { COACH_TRIAL_DAYS, REFERRAL_COMMISSION_RATE } from '@/lib/plans';
import { pricingCards } from '@/lib/pricing';
import { getHeroDemo } from '@/lib/public-demo';
import { commissionPerSale, TREND_LABELS } from '@/lib/score';
import { formatCompact, formatEuros, formatGrowth } from '@/lib/utils';

export const metadata: Metadata = { title: { absolute: `${BRAND} · ${BRAND_TAGLINE}` } };
export const revalidate = 3600;

const STEPS = [
  {
    title: 'Chaque nuit, on analyse',
    text: 'À 4 h, on passe en revue les produits ouverts à l’affiliation en France : ventes estimées, commission, nombre d’affiliés, échantillons.',
  },
  {
    title: 'Le matin, tu sais quoi vendre',
    text: 'Ton radar classe les produits de tes niches par score d’opportunité, et te dit pourquoi en phrases simples.',
  },
  {
    title: 'Tu tournes, beaucoup',
    text: 'En un clic : 10 accroches et 3 scripts plan par plan, dans ton style. Tu suis ton objectif de 20 vidéos par produit.',
  },
];

const FAQ = [
  {
    q: 'Vous vous connectez à mon compte TikTok ?',
    a: 'Jamais. Pas de mot de passe, pas de publication automatique, pas de scraping de ton compte. Les données produits viennent d’API officielles ou de fournisseurs de données.',
  },
  {
    q: 'Je n’ai pas encore 1 500 abonnés.',
    a: 'Tu démarres en mode préparation : tu vois les produits qui montent et tu t’entraînes avec les scripts. Tes vidéos font grandir ton compte en attendant de pouvoir vendre.',
  },
  {
    q: 'Est-ce que je vais gagner de l’argent ?',
    a: 'On ne promet rien. L’outil t’aide à choisir de meilleurs produits et à produire plus de vidéos ; tes ventes dépendent de tes vidéos, de ton audience et du produit.',
  },
  {
    q: 'Les scripts sont-ils prêts à publier ?',
    a: 'Ils sont prêts à tourner. Ils évitent les promesses médicales et les superlatifs, et te rappellent de signaler la collaboration commerciale (#publicité). Relis-les toujours avec ton ton à toi.',
  },
  {
    q: 'Je peux arrêter quand je veux ?',
    a: 'Oui. Sans engagement : tu résilies depuis ton compte en deux clics, et tu gardes l’accès jusqu’à la fin de la période payée.',
  },
];

export default async function HomePage() {
  const demo = await getHeroDemo();
  const p = demo.product;
  const script = demo.scripts.scripts[0];

  return (
    <>
      {/* Premier écran : le produit lui-même (sur mobile, l'aperçu vient juste après le titre) */}
      <section className="mx-auto grid max-w-6xl gap-x-16 gap-y-6 px-4 pb-16 pt-6 sm:px-6 sm:pt-10 lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[auto_1fr] lg:items-center lg:pb-24 lg:pt-16">
        <h1 className="text-[2.15rem] leading-[1.08] sm:text-5xl lg:self-end lg:text-[3.6rem] lg:leading-[1.05]">
          Sache chaque matin quoi vendre sur TikTok&nbsp;Shop
        </h1>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <HeroPreview
            name={p.name}
            niche={nicheShort(p.niche)}
            imageUrl={p.image_url}
            price={formatEuros(p.price_cents)}
            commission={formatEuros(commissionPerSale(p.price_cents, p.commission_rate))}
            affiliates={formatCompact(p.active_affiliates)}
            trend={`${TREND_LABELS[p.trend]} ${formatGrowth(p.growth_7d)}`}
            score={p.latest_score}
            sales={p.sales_30d.slice(-14)}
            hook={demo.hook}
            freeSample={p.free_sample}
            demoData={demo.demoData}
          />
        </div>
        <div className="flex flex-col lg:self-start">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:order-2 lg:mt-8">
            <LinkButton href="/connexion" size="lg">
              Voir les produits du jour
            </LinkButton>
            <Link href="/prix" className="px-2 py-2 text-center font-semibold text-muted hover:text-fg">
              Voir les prix
            </Link>
          </div>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted lg:order-1 lg:mt-0">
            Les produits qui montent dans tes niches, un score expliqué, et tes scripts vidéo écrits pour toi. En français, chaque
            matin à l’heure du café.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-muted lg:order-3 lg:mt-8">
            {['Gratuit pour commencer, sans carte bancaire', 'On ne se connecte jamais à ton compte TikTok', 'Résiliable en deux clics'].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-gain" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Comment ça marche : une vraie séquence */}
      <section className="border-y border-line bg-surface/60" aria-labelledby="comment">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 id="comment" className="text-3xl">
            Comment ça marche
          </h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="num flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fg text-lg font-bold text-bg">
                    {i + 1}
                  </span>
                  {i < STEPS.length - 1 ? <span className="hidden h-px flex-1 bg-line md:block" aria-hidden="true" /> : null}
                </div>
                <h3 className="mt-4 text-xl">{step.title}</h3>
                <p className="mt-2 max-w-sm leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Studio de scripts en démonstration */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24" aria-labelledby="studio">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <div>
            <h2 id="studio" className="text-3xl">
              Le studio écrit tes vidéos
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-muted">
              Choisis un produit et un format. Tu reçois 10 accroches de moins de 3 secondes et 3 scripts de 20 à 40 secondes, plan
              par plan, avec le texte à l’écran. Écrits avec tes mots, pour ton style de vidéo.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Formats disponibles">
              {SCRIPT_FORMATS.map((f) => (
                <li key={f.id} className="rounded-full border border-line px-3 py-1.5 text-sm font-medium">
                  {f.label}
                </li>
              ))}
            </ul>
            <Callout tone="neutral" className="mt-6" icon={<ShieldCheck className="h-5 w-5 text-gain" aria-hidden="true" />}>
              Pas de promesse médicale, pas de superlatif inventé, et le rappel #publicité à chaque script.
            </Callout>
          </div>

          <figure className="rounded-[1.75rem] border border-line bg-raised p-5 sm:p-6">
            <figcaption className="text-sm text-muted">
              Exemple : {formatLabel('demo')} pour «&nbsp;{p.name}&nbsp;»
            </figcaption>
            <p className="mt-4 text-sm font-semibold">Accroches</p>
            <ol className="mt-2 space-y-1.5">
              {demo.scripts.hooks.slice(0, 3).map((h, i) => (
                <li key={h.text} className="flex gap-3 rounded-xl bg-surface px-3 py-2.5">
                  <span className="num text-sm font-bold text-muted">{i + 1}</span>
                  <span className="font-semibold">{h.text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-sm font-semibold">
              Script 1 · {script.title} · <span className="num">{script.duration_seconds} s</span>
            </p>
            <ol className="mt-3 space-y-3">
              {script.shots.slice(0, 3).map((shot) => (
                <li key={shot.time} className="grid grid-cols-[4rem_1fr] gap-3 text-sm">
                  <span className="num h-fit w-fit rounded-full bg-fg px-2 py-0.5 text-xs font-bold text-bg">{shot.time}</span>
                  <div>
                    <p className="text-muted">{shot.visual}</p>
                    <p className="mt-1 font-medium">«&nbsp;{shot.voice}&nbsp;»</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-muted">… et 2 autres scripts, chacun avec un angle différent.</p>
          </figure>
        </div>
      </section>

      {/* Prix */}
      <section className="border-t border-line" aria-labelledby="prix">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 id="prix" className="text-center text-3xl">
            Commence gratuitement
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted">Passe Pro quand tu publies tous les jours. Sans engagement.</p>
          <div className="mt-10">
            <PricingCards plans={pricingCards()} mode="public" />
          </div>
        </div>
      </section>

      {/* Formateurs */}
      <section className="bg-ink text-white" aria-labelledby="formateurs">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:py-20">
          <div>
            <h2 id="formateurs" className="text-3xl">
              Tu es formateur TikTok Shop ?
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-white/75">
              Donne à tes élèves l’outil qui leur dit quoi vendre chaque matin. Tu suis leur progression, et tu touches une
              commission sur leurs abonnements.
            </p>
          </div>
          <div>
            <ul className="space-y-3">
              {[
                `${Math.round(REFERRAL_COMMISSION_RATE * 100)} % de commission récurrente sur tes élèves`,
                `${Math.round(COACH_TRIAL_DAYS / 30)} mois de Pro offerts à chacun de tes élèves`,
                'Un espace pour suivre leur progression',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#25F4EE]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <LinkButton href="/formateurs" size="lg" className="mt-6">
              Devenir partenaire
            </LinkButton>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24" aria-labelledby="faq">
        <h2 id="faq" className="text-3xl">
          Questions fréquentes
        </h2>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                {item.q}
                <span className="text-2xl font-normal text-muted transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-prose leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
