import type { Metadata } from 'next';
import { BellPlus, BookmarkCheck, CalendarDays, Scale, Star } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { toggleFavoriteAction } from '@/app/app/actions';
import { ProductBadges, WhyNowLine } from '@/components/product/badges';
import { ProductImage, TrendBadge } from '@/components/product/bits';
import { EarningsSimulation } from '@/components/product/earnings-simulation';
import { HookAnalysisView } from '@/components/product/hook-analysis';
import { MiniProductCard } from '@/components/product/mini-product-card';
import { SalesChart } from '@/components/product/sales-chart';
import { SalesPeriodsChart } from '@/components/product/sales-periods-chart';
import { ScoreBreakdownList } from '@/components/product/score-breakdown';
import { ScoreHistoryChart } from '@/components/product/score-history-chart';
import { ScoreValue, scoreTier } from '@/components/product/score';
import { TopVideoList } from '@/components/product/top-videos';
import { LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, EmptyState, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getLiveCatalog } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import { MIN_DAYS_FOR_CURVE, videosAreFresh } from '@/lib/jobs/refresh';
import { nicheLabel } from '@/lib/niches';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { periodBars } from '@/lib/product-periods';
import { accessibleIds, canAccessProduct, scoresFor, toProductView } from '@/lib/radar';
import { HOOK_KIND, readHookAnalysis } from '@/lib/radar/hook-analysis';
import { personalReasons } from '@/lib/radar/personal';
import { productActionLinks } from '@/lib/radar/product-page';
import { effectiveWeights, getFavorites, getRadarSettings } from '@/lib/radar/settings';
import { sameShopProducts, similarProducts } from '@/lib/radar/similar';
import { whyNowForProduct } from '@/lib/radar/why-now';
import { remainingToday } from '@/lib/v2/quota';
import { cn, formatCompact, formatEuros, formatInt, formatShortDate, parisDate, plural } from '@/lib/utils';
import { analyzeHooksAction, loadVideosAction, saveProductAction } from './actions';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const product = await getRepo().getProduct(params.id);
  return { title: product?.name ?? 'Produit' };
}

const HOOK_ERRORS: Record<string, string> = {
  quota: 'Tes analyses d’accroches du jour sont faites : reviens demain.',
  videos: 'Il faut d’abord les vidéos de ce produit.',
  ia: 'L’analyse n’a pas abouti. Réessaie dans un moment : rien n’a été décompté.',
};

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

  const plan = getPlan(profile.plan);
  const region = product.region ?? 'FR';
  const [saved, snapshots, settings, favorites, catalog] = await Promise.all([
    repo.getSavedProduct(profile.id, product.id),
    repo.getProductSnapshots(product.id, 30),
    getRadarSettings(profile.id, repo),
    getFavorites(profile.id, repo),
    getLiveCatalog(repo, new Date(), region),
  ]);
  const scores = plan.showScore ? scoresFor(catalog.products, profile, settings) : null;
  const whyNow = await whyNowForProduct(product, region, catalog.dataDate ?? product.snapshot_date, { repo });
  const view = toProductView(product, profile.plan, Boolean(saved), {
    scores: scores?.get(product.id),
    whyNow,
    favorite: favorites.includes(product.id),
  });
  const weights = effectiveWeights(profile, settings);

  const chart = snapshots.length
    ? snapshots.map((s) => ({ label: formatShortDate(s.date), ventes: s.estimated_sales, affilies: s.affiliates }))
    : view.sales_30d.map((v, i) => ({ label: `J-${view.sales_30d.length - i - 1}`, ventes: v, affilies: view.active_affiliates }));
  const knownDays = chart.filter((point) => point.ventes !== null).length;
  const hasAffiliates = chart.some((point) => point.affilies !== null);
  const scoreHistory = snapshots.map((s) => ({ label: formatShortDate(s.date), score: s.score }));
  const details = product.details;
  const figures = view.figures;
  const keyFigures = [
    details?.price_min_cents && details.price_max_cents && details.price_max_cents > details.price_min_cents
      ? { label: 'Prix', value: formatEuros(view.price_cents), sub: `de ${formatEuros(details.price_min_cents)} à ${formatEuros(details.price_max_cents)}` }
      : { label: 'Prix', value: formatEuros(view.price_cents) },
    { label: 'Ta commission', value: `${formatEuros(view.commission_cents)}`, sub: `par vente (${Math.round(view.commission_rate * 100)} %)`, gain: true },
    figures.sales_7d !== null
      ? { label: 'Ventes sur 7 jours', value: formatCompact(figures.sales_7d), sub: 'estimées' }
      : { label: 'Ventes', value: '—', sub: 'mesurées dès la prochaine nuit' },
    ...(figures.sales_30d !== null ? [{ label: 'Ventes sur 30 jours', value: formatCompact(figures.sales_30d), sub: 'estimées' }] : []),
    ...(view.active_affiliates !== null ? [{ label: 'Affiliés actifs', value: formatInt(view.active_affiliates) }] : []),
    ...(details?.revenue_cents?.d30 ? [{ label: 'Chiffre d’affaires 30 j', value: formatEuros(details.revenue_cents.d30, { round: true }), sub: 'estimé par la source' }] : []),
    ...(figures.first_seen ? [{ label: 'Premier relevé', value: formatShortDate(figures.first_seen), sub: `il y a ${plural(figures.age_days ?? 0, 'jour')}` }] : []),
  ];
  // Moins de 7 jours de relevés : ventes par période de la source (si elle les donne), sinon la courbe se remplit.
  const bars = knownDays < MIN_DAYS_FOR_CURVE ? periodBars(details, product.snapshot_date ?? parisDate()) : [];
  const canLoadVideos = !view.top_videos.length && !videosAreFresh(product.videos_fetched_at) && product.provider !== 'tiktok';
  const tier = view.score !== null ? scoreTier(view.score) : null;

  // Accroches : l'analyse en cache s'affiche sans rien coûter ; une nouvelle compte dans le quota du jour.
  const [hookAnalysis, hooksLeft] = plan.hookAnalysesPerDay
    ? await Promise.all([readHookAnalysis(product, repo), remainingToday(profile.id, HOOK_KIND, plan.hookAnalysesPerDay)])
    : [null, 0];

  // Produits proches : seulement ceux que ce compte peut ouvrir (Gratuit : ses produits du jour et ceux qu'il suit).
  const open = await accessibleIds(profile, catalog.products);
  const allowed = catalog.products.filter((p) => !open || open.has(p.id));
  const similar = similarProducts(product, allowed);
  const shop = sameShopProducts(product, allowed);
  const mini = (p: (typeof allowed)[number]) => toProductView(p, profile.plan, false, { scores: scores?.get(p.id) });
  const links = productActionLinks(view.id);

  return (
    <div>
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-muted">
        <Link href="/app/radar" className="hover:text-fg">
          Radar
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/app/radar?niche=${view.niche}`} className="hover:text-fg">
          {nicheLabel(view.niche)}
        </Link>
        {figures.subcategory ? (
          <>
            <span aria-hidden="true"> / </span>
            <Link href={`/app/radar?souscat=${encodeURIComponent(figures.subcategory)}`} className="hover:text-fg">
              {figures.subcategory}
            </Link>
          </>
        ) : null}
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
              {figures.category.length ? <p className="mt-0.5 text-xs text-muted">Catégorie TikTok Shop : {figures.category.join(' › ')}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <TrendBadge trend={view.trend} growth={view.growth_7d} measured={view.growth_known} />
                <ProductBadges badges={view.badges} trend={view.trend} growthKnown={view.growth_known} />
                {figures.rating !== null ? (
                  <span className="num text-xs text-muted">
                    ★ {String(figures.rating).replace('.', ',')} / 5{figures.review_count !== null ? ` · ${formatInt(figures.review_count)} avis` : ''}
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          <Panel>
            <WhyNowLine whyNow={view.why_now} withLabel />
          </Panel>

          {/* Chiffres clés */}
          <dl className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line', keyFigures.length >= 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
            {keyFigures.map((item) => (
              <div key={item.label} className="bg-raised p-3.5">
                <dt className="text-xs font-medium text-muted">{item.label}</dt>
                <dd className={cn('num mt-1 text-xl font-semibold', 'gain' in item && item.gain && 'text-gain')}>{item.value}</dd>
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
                <ScoreBreakdownList breakdown={view.breakdown} score={weights ? null : view.score} />
                {weights && view.score !== null ? (
                  <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-muted">
                    Le score <span className="num font-semibold text-fg">{view.score}</span> suit tes poids (réglés dans le radar) : les
                    points de chaque critère ci-dessus sont ceux du réglage par défaut.{' '}
                    <Link href="/app/radar#poids" className="font-semibold text-cyan-ink hover:underline">
                      Changer mes poids
                    </Link>
                  </p>
                ) : null}
              </Panel>
              {view.personal_score !== null ? (
                <Panel className="mt-3">
                  <p className="font-medium">
                    Score pour toi : <span className="num font-semibold">{view.personal_score}</span>
                    <span className="text-muted"> (score général {view.score})</span>
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                    {personalReasons(product, profile, weights).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </section>
          ) : null}

          {/* Évolution du score */}
          <section aria-labelledby="evolution">
            <h2 id="evolution" className="mb-3 text-lg">
              Évolution du score
            </h2>
            {view.score === null ? (
              <p className="text-sm text-muted">
                L’évolution du score sur 30 jours s’ouvre avec Pro.{' '}
                <Link href="/app/passer-pro" className="font-semibold text-rose-ink hover:underline">
                  Passer Pro
                </Link>
              </p>
            ) : scoreHistory.length >= 2 ? (
              <Card>
                <ScoreHistoryChart data={scoreHistory} />
                <p className="mt-2 text-xs text-muted">
                  Score général de chaque jour (poids par défaut), sur {plural(scoreHistory.length, 'relevé')}. Le score place le produit
                  parmi ceux du jour : il peut baisser sans que les ventes baissent, si d’autres produits montent plus vite.
                </p>
              </Card>
            ) : (
              <p className="text-sm text-muted">La courbe du score se trace à partir de deux relevés : reviens demain.</p>
            )}
          </section>

          {/* Simulation */}
          <section aria-labelledby="simulation">
            <h2 id="simulation" className="mb-1 text-lg">
              Simulation
            </h2>
            <p className="mb-3 text-sm text-muted">Règle les hypothèses : le calcul se fait avec la commission de ce produit aujourd’hui.</p>
            <Card>
              <EarningsSimulation commissionCents={view.commission_cents} />
            </Card>
          </section>

          {/* Vidéos qui vendent */}
          <section aria-labelledby="videos-titre" id="videos">
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

            {/* Accroches analysées par l'IA */}
            {view.top_videos.length ? (
              <div id="accroches" className="mt-4">
                <h3 className="mb-2 text-base">Leurs accroches, analysées</h3>
                {searchParams.accroches && HOOK_ERRORS[searchParams.accroches] ? (
                  <Callout tone="rose" className="mb-3" title={HOOK_ERRORS[searchParams.accroches]} />
                ) : null}
                {hookAnalysis ? (
                  <HookAnalysisView analysis={hookAnalysis} />
                ) : plan.hookAnalysesPerDay ? (
                  <Panel className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted">
                      Type d’accroche, durée et structure de chaque vidéo, à partir de son texte et de ses chiffres.{' '}
                      {hooksLeft > 0 ? `${plural(hooksLeft, 'analyse restante', 'analyses restantes')} aujourd’hui.` : 'Plus d’analyse aujourd’hui.'}
                    </p>
                    <form action={analyzeHooksAction}>
                      <input type="hidden" name="produit" value={view.id} />
                      <SubmitButton variant="outline" size="sm" pendingLabel="Analyse…" disabled={hooksLeft <= 0}>
                        Analyser les accroches
                      </SubmitButton>
                    </form>
                  </Panel>
                ) : (
                  <p className="text-sm text-muted">
                    L’analyse des accroches s’ouvre avec Pro.{' '}
                    <Link href="/app/passer-pro" className="font-semibold text-rose-ink hover:underline">
                      Passer Pro
                    </Link>
                  </p>
                )}
              </div>
            ) : null}
          </section>

          {/* Produits proches */}
          {similar.products.length ? (
            <section aria-labelledby="similaires">
              <h2 id="similaires" className="mb-3 text-lg">
                {similar.basis === 'souscat' ? `Autres produits « ${similar.label} »` : `Autres produits ${nicheLabel(product.niche).toLowerCase()}`}
              </h2>
              <ul className="grid gap-1 sm:grid-cols-2">
                {similar.products.map((p) => (
                  <li key={p.id}>
                    <MiniProductCard product={mini(p)} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {shop.length ? (
            <section aria-labelledby="boutique">
              <h2 id="boutique" className="mb-3 text-lg">
                Aussi chez {product.shop_name}
              </h2>
              <ul className="grid gap-1 sm:grid-cols-2">
                {shop.map((p) => (
                  <li key={p.id}>
                    <MiniProductCard product={mini(p)} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Colonne d'action */}
        <aside className="space-y-4 lg:sticky lg:top-10 lg:self-start">
          <Card className="border-fg/15">
            <p className="text-xs font-medium text-muted">Score d’opportunité{weights ? ' (tes poids)' : ''}</p>
            <div className="mt-2">
              <ScoreValue score={view.score} size="xl" />
            </div>
            {tier ? <p className={cn('mt-2 text-sm font-semibold', tier.tone === 'cyan' ? 'text-cyan-ink' : 'text-muted')}>{tier.label}</p> : null}
            {view.personal_score !== null ? (
              <p className="num mt-1 text-sm text-muted">
                Pour toi : <span className="font-semibold text-fg">{view.personal_score}</span>
              </p>
            ) : null}
            <div className="mt-5 space-y-2">
              <LinkButton href={links.scripts} size="lg" className="w-full">
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
              <LinkButton href={links.plan} variant="outline" size="lg" className="w-full">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
                Planifier 20 vidéos
              </LinkButton>
              <LinkButton href={links.alert} variant="outline" size="lg" className="w-full">
                <BellPlus className="h-5 w-5" aria-hidden="true" />
                Créer une alerte
              </LinkButton>
              <form action={toggleFavoriteAction}>
                <input type="hidden" name="produit" value={view.id} />
                <input type="hidden" name="retour" value={`/app/produit/${view.id}`} />
                <SubmitButton variant="ghost" size="md" className="w-full" pendingLabel="…">
                  <Star className={cn('h-4 w-4', view.favorite && 'fill-current text-cyan-ink')} aria-hidden="true" />
                  {view.favorite ? 'Retirer des favoris' : 'Mettre en favori'}
                </SubmitButton>
              </form>
              {plan.compare && favorites.length >= 2 ? (
                <LinkButton href={links.compare} variant="ghost" className="w-full">
                  <Scale className="h-4 w-4" aria-hidden="true" />
                  Comparer mes favoris
                </LinkButton>
              ) : null}
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
