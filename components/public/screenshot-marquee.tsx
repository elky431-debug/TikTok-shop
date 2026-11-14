/**
 * Défilé de captures de l'accueil, repris d'EtSmart : deux rangées de cartes qui défilent en continu en sens
 * inverse, bords en fondu, nom de la fonction en bas à gauche. Pause au survol, fixe (et défilable à la main) si
 * « réduire les animations », une seule rangée sur téléphone. Styles dans `app/globals.css` (`.marquee-*`).
 *
 * Les images viennent de `npm run screenshots:landing` (vraies pages, compte de démo, ou capture fournie à la main dans
 * `docs/landing/`) : `public/landing/<slug>.webp` (640 × 416, écrans à haute densité) et `<slug>-320.webp` (320 × 208).
 */

export interface MarqueeShot {
  slug: string;
  label: string;
  /** Petit badge en haut à droite (« Exemple » sur le dashboard : montants du compte de démo, pas une promesse). */
  badge?: string;
}

/** Même ordre que `LANDING_SHOTS` dans `scripts/screenshots-landing.ts`. */
export const MARQUEE_SHOTS: MarqueeShot[] = [
  { slug: 'dashboard', label: 'Dashboard', badge: 'Exemple' },
  { slug: 'radar', label: 'Radar' },
  { slug: 'fiche-produit', label: 'Fiche produit' },
  { slug: 'studio', label: 'Studio de scripts' },
  { slug: 'serie', label: 'Série de 20 vidéos' },
  { slug: 'teleprompteur', label: 'Téléprompteur' },
  { slug: 'plan', label: 'Plan de publication' },
  { slug: 'recap', label: 'Récap du matin' },
  { slug: 'propositions', label: 'Propositions de marques' },
  { slug: 'analyse', label: 'Analyse de vidéo' },
  { slug: 'alertes', label: 'Alertes' },
  { slug: 'comparateur', label: 'Comparateur' },
];

function Card({ shot, decorative }: { shot: MarqueeShot; decorative: boolean }) {
  const Tag = decorative ? 'div' : 'figure';
  const Caption = decorative ? 'span' : 'figcaption';
  return (
    <Tag className="relative h-44 w-[270px] flex-shrink-0 overflow-hidden rounded-2xl border border-line bg-surface sm:h-52 sm:w-80">
      {/* eslint-disable-next-line @next/next/no-img-element -- fichiers déjà optimisés, deux tailles en srcset */}
      <img
        src={`/landing/${shot.slug}-320.webp`}
        srcSet={`/landing/${shot.slug}-320.webp 320w, /landing/${shot.slug}.webp 640w`}
        sizes="(min-width: 640px) 320px, 270px"
        width={640}
        height={416}
        alt=""
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover object-top"
      />
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink/20 via-transparent to-transparent" />
      <Caption className="absolute bottom-3 left-3 rounded-lg bg-ink/80 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
        {shot.label}
      </Caption>
      {shot.badge ? (
        <span className="absolute right-3 top-3 rounded-full border border-line bg-bg/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-ink">
          {shot.badge}
        </span>
      ) : null}
    </Tag>
  );
}

function Row({ shots, direction, decorative = false }: { shots: MarqueeShot[]; direction: 'left' | 'right'; decorative?: boolean }) {
  return (
    <div className="marquee-row">
      <div className={`marquee-track marquee-${direction}`}>
        {[0, 1].map((dup) => (
          // Deuxième copie pour une boucle sans couture (translation de −50 %), cachée aux lecteurs d'écran.
          <div key={dup} className="marquee-group flex gap-4 pr-4" aria-hidden={dup === 1 || undefined}>
            {shots.map((shot) => (
              <Card key={shot.slug} shot={shot} decorative={decorative || dup === 1} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScreenshotMarquee({ shots = MARQUEE_SHOTS }: { shots?: MarqueeShot[] }) {
  return (
    <section className="overflow-hidden py-10" aria-label="Captures de l’appli">
      <div className="space-y-4">
        <Row shots={shots} direction="left" />
        {/* Sur téléphone, une seule rangée ; la seconde (ordre inverse) n'apporte rien aux lecteurs d'écran. */}
        <div aria-hidden="true" className="hidden sm:block">
          <Row shots={[...shots].reverse()} direction="right" decorative />
        </div>
      </div>
    </section>
  );
}
