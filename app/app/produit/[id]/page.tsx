import type { Metadata } from 'next';
import { BookmarkCheck } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductImage, TrendBadge } from '@/components/product/bits';
import { SalesChart } from '@/components/product/sales-chart';
import { SalesPeriodsChart } from '@/components/product/sales-periods-chart';
import { ScoreBreakdownList } from '@/components/product/score-breakdown';
import { ScoreValue, scoreTier } from '@/components/product/score';
import { TopVideoList } from '@/components/product/top-videos';
import { LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, EmptyState, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { MIN_DAYS_FOR_CURVE, videosAreFresh } from '@/lib/jobs/refresh';
import { nicheLabel } from '@/lib/niches';
import { isPaidPlan } from '@/lib/plans';
import { periodBars } from '@/lib/product-periods';
import { canAccessProduct, toProductView } from '@/lib/radar';
import { cn, formatCompact, formatEuros, formatInt, formatShortDate, parisDate } from '@/lib/utils';
import { loadVideosAction, saveProductAction } from './actions';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const product = await getRepo().getProduct(params.id);
  return { title: product?.name ?? 'Produit' };
}

export default async function ProductPage({
  params,
  searchParams = {},
}: {
  params: { id: string };
  searchParams?: Record<string, string | undefined>;
}) {
  const { profile } = await requireOnboardedViewer(`/app/produit/${params.id}`);
  const repo = getRepo();
  const product = await repo.getProduct(params.id);
  if (!product) notFound();

  if (!(await canAccessProduct(profile, product.id))) {
    return (
      <EmptyState
        title="Ce produit est réservé au plan Pro"
        action={<LinkButton href="/app/passer-pro">Passer Pro</LinkButton>}
        className="mt-10"
      >
        Le plan Gratuit ouvre tes 3 produits du jour. Avec Pro, tu ouvres toutes les fiches, avec le score détaillé.
      </EmptyState>
    );
  }

  const [saved, snapshots] = await Promise.all([repo.getSavedProduct(profile.id, product.id), repo.getProductSnapshots(product.id, 30)]);
  const view = toProductView(product, profile.plan, Boolean(saved));
  const chart = snapshots.length
    ? snapshots.map((s) => ({ label: formatShortDate(s.date), ventes: s.estimated_sales, affilies: s.affiliates }))
    : view.sales_30d.map((v, i) => ({ label: `J-${view.sales_30d.length - i - 1}`, ventes: v, affilies: view.active_affiliates }));
  const knownDays = chart.filter((point) => point.ventes !== null).length;
  const hasAffiliates = chart.some((point) => point.affilies !== null);
  const sales30 = view.sales_30d.reduce((a, b) => a + b, 0);
  const keyFigures = [
    { label: 'Prix', value: formatEuros(view.price_cents) },
    { label: 'Ta commission', value: `${formatEuros(view.commission_cents)}`, sub: `par vente (${Math.round(view.commission_rate * 100)} %)`, gain: true },
    view.sales_30d.length
      ? view.sales_30d.length === 1
        ? { label: 'Ventes par jour', value: formatCompact(sales30), sub: 'estimées' }
        : { label: knownDays >= 30 ? 'Ventes sur 30 jours' : `Ventes sur ${view.sales_30d.length} jours`, value: formatCompact(sales30), sub: 'estimées' }
      : { label: 'Ventes', value: '—', sub: 'mesurées dès la prochaine nuit' },
    ...(view.active_affiliates !== null ? [{ label: 'Affiliés actifs', value: formatInt(view.active_affiliates) }] : []),
  ];
  // Moins de 7 jours de relevés : ventes par période de la source (si elle les donne), sinon la courbe se remplit.
  const bars = knownDays < MIN_DAYS_FOR_CURVE ? periodBars(product.details, product.snapshot_date ?? parisDate()) : [];
  const rating = product.details?.rating ?? null;
  const reviews = product.details?.review_count ?? null;
  const canLoadVideos = !view.top_videos.length && !videosAreFresh(product.videos_fetched_at) && product.provider !== 'tiktok';
  const tier = view.score !== null ? scoreTier(view.score) : null;

  return (
    <div>
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-muted">
        <Link href="/app" className="hover:text-fg">
          Radar
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{nicheLabel(view.niche)}</span>
      </nav>

      {view.demo ? (
        <Callout tone="neutral" className="mb-6" title="Produit fictif">
          Ce produit sert de démonstration : il n’existe pas sur TikTok Shop. Les vrais produits arrivent dès que la
          source de données est branchée.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:gap-10">
        <div className="min-w-0 space-y-6">
          {/* En-tête produit */}
          <header className="flex gap-4">
            <ProductImage src={view.image_url} fallback={view.image_fallback} alt={`Visuel de ${view.name}`} className="w-24 sm:w-32" />
            <div className="min-w-0">
              {/* Les vrais titres TikTok Shop font souvent 150 à 250 caractères : plus petits au-delà de 80. */}
              <h1 className={cn('leading-tight', view.name.length > 80 ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl')}>{view.name}</h1>
              <p className="mt-1 text-sm text-muted">
                {nicheLabel(view.niche)}
                {view.shop_name ? ` · vendu par ${view.shop_name}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <TrendBadge trend={view.trend} growth={view.growth_7d} measured={view.growth_known} />
                {rating !== null ? (
                  <span className="num text-xs text-muted">
                    ★ {String(rating).replace('.', ',')} / 5{reviews !== null ? ` · ${formatInt(reviews)} avis` : ''}
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          {/* Chiffres clés */}
          <dl
            className={cn(
              'grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line',
              keyFigures.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3',
            )}
          >
            {keyFigures.map((item) => (
              <div key={item.label} className="bg-raised p-3.5">
                <dt className="text-xs font-medium text-muted">{item.label}</dt>
                <dd className={cn('num mt-1 text-xl font-semibold', item.gain && 'text-gain')}>{item.value}</dd>
                {'sub' in item && item.sub ? <dd className="text-xs text-muted">{item.sub}</dd> : null}
              </div>
            ))}
          </dl>

          {/* Courbe 30 jours, ou ventes par période tant que l'historique est court */}
          <Card>
            {bars.length && knownDays < MIN_DAYS_FOR_CURVE ? (
              <>
                <div className="mb-3">
                  <h2 className="text-lg">Ventes par période</h2>
                  <p className="mt-1 text-xs text-muted">
                    Moyenne par jour sur chaque période, d’après la source de données. La courbe jour par jour prend le relais
                    après {MIN_DAYS_FOR_CURVE} jours de relevés.
                  </p>
                </div>
                <SalesPeriodsChart bars={bars} />
              </>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg">Ventes sur 30 jours</h2>
                  <p className={cn('flex items-center gap-3 text-xs text-muted', knownDays < 2 && 'hidden')}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-0.5 w-4 rounded bg-cyan-ink" aria-hidden="true" /> Ventes estimées
                    </span>
                    {hasAffiliates ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-0 w-4 border-t-2 border-dashed border-subtle" aria-hidden="true" /> Affiliés
                      </span>
                    ) : null}
                  </p>
                </div>
                {knownDays >= 2 ? (
                  <SalesChart data={chart} showAffiliates={hasAffiliates} />
                ) : (
                  <p className="py-10 text-center text-sm text-muted">
                    La courbe se remplit chaque nuit : il faut au moins deux relevés pour la tracer.
                  </p>
                )}
              </>
            )}
          </Card>

          {/* Pourquoi ce score */}
          {view.breakdown ? (
            <section aria-labelledby="pourquoi">
              <div className="mb-3 flex items-end justify-between gap-4">
                <h2 id="pourquoi" className="text-lg">
                  Pourquoi ce score
                </h2>
                {view.score === null ? (
                  <Link href="/app/passer-pro" className="text-sm font-semibold text-rose-ink hover:underline">
                    Voir les points avec Pro
                  </Link>
                ) : null}
              </div>
              <Panel>
                <p className="mb-4 font-medium">{view.breakdown.summary}</p>
                <ScoreBreakdownList breakdown={view.breakdown} score={view.score} />
              </Panel>
            </section>
          ) : null}

          {/* Vidéos qui vendent */}
          <section aria-labelledby="videos" id="videos">
            <h2 id="videos-titre" className="mb-3 text-lg">
              Les vidéos qui vendent le mieux
            </h2>
            {searchParams.videos === 'erreur' ? (
              <Callout tone="rose" className="mb-3" title="Les vidéos n’ont pas pu être chargées. Réessaie dans un moment." />
            ) : null}
            {view.top_videos.length ? (
              <TopVideoList videos={view.top_videos} />
            ) : canLoadVideos && isPaidPlan(profile.plan) ? (
              <Panel className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">Les vidéos de ce produit n’ont pas encore été chargées.</p>
                <form action={loadVideosAction}>
                  <input type="hidden" name="produit" value={view.id} />
                  <SubmitButton variant="outline" size="sm" pendingLabel="Chargement…">
                    Charger les vidéos
                  </SubmitButton>
                </form>
              </Panel>
            ) : canLoadVideos ? (
              <p className="text-sm text-muted">
                Les vidéos de chaque produit s’ouvrent avec le plan Pro.{' '}
                <Link href="/app/passer-pro" className="font-semibold text-rose-ink hover:underline">
                  Passer Pro
                </Link>
              </p>
            ) : (
              <p className="text-sm text-muted">Aucune vidéo qui vend ce produit n’a été trouvée pour l’instant.</p>
            )}
          </section>
        </div>

        {/* Colonne d'action */}
        <aside className="space-y-4 lg:sticky lg:top-10 lg:self-start">
          <Card className="border-fg/15">
            <p className="text-xs font-medium text-muted">Score d’opportunité</p>
            <div className="mt-2">
              <ScoreValue score={view.score} size="xl" />
            </div>
            {tier ? <p className={cn('mt-2 text-sm font-semibold', tier.tone === 'cyan' ? 'text-cyan-ink' : 'text-muted')}>{tier.label}</p> : null}
            <div className="mt-5 space-y-2">
              <LinkButton href={`/app/studio?produit=${view.id}`} size="lg" className="w-full">
                Écrire mes scripts
              </LinkButton>
              {view.saved ? (
                <LinkButton href="/app/mes-produits" variant="outline" size="lg" className="w-full">
                  <BookmarkCheck className="h-5 w-5" aria-hidden="true" />
                  Ajouté à mes produits
                </LinkButton>
              ) : (
                <form action={saveProductAction}>
                  <input type="hidden" name="produit" value={view.id} />
                  <SubmitButton variant="outline" size="lg" className="w-full" pendingLabel="Ajout…">
                    Ajouter à mes produits
                  </SubmitButton>
                </form>
              )}
            </div>
            <p className="mt-3 text-xs text-muted">
              Objectif conseillé : 20 vidéos sur ce produit. Chez les affiliés, c’est le volume sur un même produit qui fait la différence.
            </p>
          </Card>

        </aside>
      </div>
    </div>
  );
}
