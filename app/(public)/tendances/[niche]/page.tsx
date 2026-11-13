import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductImage, TrendBadge } from '@/components/product/bits';
import { LinkButton } from '@/components/ui/button';
import { BRAND } from '@/lib/brand';
import { nicheLabel } from '@/lib/niches';
import { fallbackImageUrl } from '@/lib/product-image';
import { isPublishedNiche, itemListJsonLd, jsonLdScript, nicheEntries, publishedNiches, getVeilleSelection } from '@/lib/tendances';
import { env } from '@/lib/env';
import { formatDayMonth, formatEuros, formatPercent } from '@/lib/utils';

/**
 * Page publique « Produits tendance TikTok Shop France » d'une catégorie : le relevé de la veille, sans score ni
 * script, avec un appel à s'inscrire. Recalculée au plus toutes les heures (le relevé change une fois par jour).
 * Catégorie sans assez de vrais produits : 404, et absente du plan du site.
 */
export const revalidate = 3600;

const title = (niche: string) => `Produits tendance TikTok Shop France : ${nicheLabel(niche)}`;

export async function generateMetadata({ params }: { params: { niche: string } }): Promise<Metadata> {
  const selection = await getVeilleSelection();
  if (!isPublishedNiche(selection, params.niche)) return { title: 'Catégorie introuvable', robots: { index: false } };
  const label = nicheLabel(params.niche).toLowerCase();
  const description = `Les produits ${label} qui montent sur TikTok Shop France, relevé du ${formatDayMonth(selection.date!)} : prix, commission par vente et tendance sur 7 jours. Mis à jour chaque jour.`;
  return {
    title: title(params.niche),
    description,
    alternates: { canonical: `/tendances/${params.niche}` },
    openGraph: { title: title(params.niche), description, type: 'website', url: `/tendances/${params.niche}` },
  };
}

export default async function TendancesNichePage({ params }: { params: { niche: string } }) {
  const selection = await getVeilleSelection();
  if (!isPublishedNiche(selection, params.niche)) notFound();
  const niche = params.niche;
  const entries = nicheEntries(selection, niche);
  const others = publishedNiches(selection).filter((n) => n.id !== niche);
  const jsonLd = itemListJsonLd({ name: title(niche), url: `${env.siteUrl}/tendances/${niche}`, entries });

  return (
    <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav aria-label="Fil d’Ariane" className="text-sm text-muted">
        <Link href="/tendances" className="hover:text-fg">
          Tendances
        </Link>{' '}
        / <span className="text-fg">{nicheLabel(niche)}</span>
      </nav>
      <header className="mt-4 max-w-3xl">
        <p className="eyebrow mb-3">TikTok Shop France</p>
        <h1 className="text-3xl/tight font-bold sm:text-5xl/tight">
          Produits tendance
          <br />
          <span className="text-gradient-live">{nicheLabel(niche).toLowerCase()}.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-muted">
          Les {entries.length} produits {nicheLabel(niche).toLowerCase()} qui montent le plus sur TikTok Shop France. Données du{' '}
          {formatDayMonth(selection.date!)}, mises à jour chaque jour. Les produits du jour, leur score expliqué et les scripts vidéo sont
          dans {BRAND}.
        </p>
      </header>

      <ol className="mt-10 space-y-3">
        {entries.map((p, i) => (
          <li key={p.id} className="feature-card flex items-start gap-3 p-3.5 sm:gap-4 sm:p-4">
            <span className="num w-6 shrink-0 pt-1 text-center text-sm font-bold text-muted">{i + 1}</span>
            <ProductImage src={p.image_url} fallback={fallbackImageUrl(p.id, p.niche)} alt="" className="w-16 sm:w-20" />
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-[15px] font-semibold leading-snug">{p.name}</h2>
              {p.shop_name ? <p className="mt-0.5 truncate text-xs text-muted">{p.shop_name}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                <span className="num">{formatEuros(p.price_cents)}</span>
                <span className="num text-muted">
                  {formatEuros(p.commission_cents)} par vente ({formatPercent(p.commission_rate)})
                </span>
                <TrendBadge trend={p.trend} growth={p.growth_7d} measured={p.growth_known} />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-12 rounded-2xl border border-line bg-raised p-6 text-center sm:p-10" aria-labelledby="inscription">
        <h2 id="inscription" className="text-2xl font-bold sm:text-3xl">
          Ceux d’aujourd’hui,
          <br />
          <span className="text-gradient">avec leur score.</span>
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-muted">
          Chaque matin, {BRAND} classe les produits de tes niches avec un score expliqué en phrases et t’écrit les scripts pour les vendre.
          Sans engagement, résiliable en deux clics.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LinkButton href="/connexion" size="lg" arrow>
            Créer mon compte
          </LinkButton>
          <LinkButton href="/prix" variant="secondary" size="lg">
            Voir les prix
          </LinkButton>
        </div>
      </section>

      {others.length ? (
        <nav className="mt-12" aria-labelledby="autres">
          <h2 id="autres" className="text-lg font-semibold">
            Autres catégories
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {others.map((n) => (
              <li key={n.id}>
                <Link href={`/tendances/${n.id}`} className="inline-flex rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <p className="mt-10 text-xs text-muted">
        Source : relevés quotidiens de fournisseurs de données TikTok Shop sous contrat. Prix et commissions tels qu’affichés par la boutique
        le jour du relevé. Aucune promesse de ventes.
      </p>
    </div>
  );
}
