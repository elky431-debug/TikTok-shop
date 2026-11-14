import type { Metadata } from 'next';
import { Radar as RadarIcon, Scale, SlidersVertical, Sprout } from 'lucide-react';
import Link from 'next/link';
import { KeywordSearchForm } from '@/components/product/keyword-search-form';
import { LockedProductCard, FeaturedProductCard, ProductCard } from '@/components/product/product-card';
import { RadarFilterBar } from '@/components/product/radar-filters';
import { RadarTable } from '@/components/product/radar-table';
import { RadarToolbar } from '@/components/product/radar-toolbar';
import { ScoreWeightsForm } from '@/components/product/score-weights';
import { LinkButton } from '@/components/ui/button';
import { Callout, EmptyState, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { NICHES, nicheLabel } from '@/lib/niches';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { AFFILIATE_THRESHOLD } from '@/lib/profile-rules';
import { filtersToParams, getRadar, parseFilters } from '@/lib/radar';
import { remainingSearches } from '@/lib/radar/keyword-search';
import { SCORE_KEYS, WEIGHT_LABELS, weightShares } from '@/lib/radar/personal';
import { getFavorites, getRadarSettings } from '@/lib/radar/settings';
import { SORT_KEYS, type SortKey } from '@/lib/radar/sort';
import { formatDayMonth, formatInt, formatLongDate, plural } from '@/lib/utils';
import { enabledRegions, REGIONS } from '@/lib/regions';
import { LaunchButton } from '@/components/launch/launch-button';
import { LaunchLimitNotice } from '@/components/launch/launch-limit';

export const metadata: Metadata = { title: 'Radar' };

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { profile } = await requireOnboardedViewer();
  const filters = parseFilters(searchParams);
  const settings = await getRadarSettings(profile.id);
  const radar = await getRadar(profile, filters, { settings });
  const plan = getPlan(profile.plan);
  const paid = isPaidPlan(profile.plan);
  const query = filtersToParams(filters).toString();
  const [searchesLeft, favorites] = await Promise.all([
    plan.keywordSearchesPerDay ? remainingSearches(profile) : Promise.resolve(0),
    plan.compare ? getFavorites(profile.id) : Promise.resolve([] as string[]),
  ]);

  const visible = radar.items.filter((i) => i.kind === 'visible');
  const isDefaultOrder = radar.sort === 'score' && radar.order === 'desc';
  const [first, ...rest] = radar.items;
  const featured = settings.vue === 'cartes' && !radar.filtered && isDefaultOrder && first?.kind === 'visible' ? first : null;
  const list = featured ? rest : radar.items;
  const nicheNames = (radar.niches.length ? radar.niches : NICHES.map((n) => n.id)).map((n) => nicheLabel(n).toLowerCase());

  // Colonnes de tri proposées : celles qui ont des données aujourd'hui ; « pour toi » à partir de Pro.
  const a = radar.availability;
  const hasData: Partial<Record<SortKey, boolean>> = {
    pourtoi: plan.personalScore,
    ventes7: a.sales7,
    ventes30: a.sales30,
    croissance: a.growth,
    affilies: a.affiliates,
    note: a.rating,
    avis: a.reviews,
    nouveaute: a.newProducts,
  };
  const sorts = SORT_KEYS.filter((key) => hasData[key] !== false);
  const sortLabels: Partial<Record<SortKey, string>> = plan.showScore ? {} : { score: 'Classement du jour' };

  return (
    <div>
      <PageHeader
        eyebrow={<>Trouver · {radar.date ? formatLongDate(radar.date) : 'Aujourd’hui'}</>}
        title={<>{profile.first_name ? `${profile.first_name}, voici` : 'Voici'} tes produits du jour</>}
        description={
          <>
            {radar.stale && radar.date ? (
              <span className="mb-2 inline-flex rounded-full border border-warn/30 bg-warn/10 px-2.5 py-0.5 text-xs font-semibold text-warn">
                Données du {formatDayMonth(radar.date)}
              </span>
            ) : null}
            <span className="block">
              {formatInt(radar.totalToday)} produits analysés en {nicheNames.join(', ')}, triés par score.{' '}
              {radar.stale
                ? 'La mise à jour de cette nuit n’a pas abouti : ce sont les derniers relevés disponibles.'
                : 'Mis à jour cette nuit.'}
            </span>
          </>
        }
      />
      <LaunchLimitNotice reason={typeof searchParams.lancement === 'string' ? searchParams.lancement : undefined} plan={profile.plan} className="mb-6" />

      <div className="space-y-3">
        {radar.region !== 'FR' ? (
          <Callout tone="cyan" title={`Catalogue : ${REGIONS[radar.region].label}`}>
            {radar.totalToday
              ? 'Tu vois les produits de ce pays. Change de pays dans ton compte.'
              : enabledRegions().includes(radar.region)
                ? 'Le premier relevé de ce pays arrive cette nuit.'
                : 'Ce pays n’est pas encore collecté chaque nuit. Repasse sur la France dans ton compte en attendant.'}
          </Callout>
        ) : null}
        {radar.demo ? (
          <Callout tone="neutral" title="Produits fictifs : démonstration">
            Ces produits n’existent pas sur TikTok Shop : ils montrent comment marche le radar en attendant le
            branchement des vraies données.
          </Callout>
        ) : null}

        {profile.eligibility === 'preparation' ? (
          <Callout
            tone="neutral"
            icon={<Sprout className="h-5 w-5 text-gain" aria-hidden="true" />}
            title="Mode préparation"
            action={
              <Link href="/app/preparation" className="text-sm font-semibold text-cyan-ink hover:underline">
                Ouvrir mon plan de préparation
              </Link>
            }
          >
            Tu n’as pas encore {formatInt(AFFILIATE_THRESHOLD)} abonnés : poste déjà sur ces produits pour faire grandir ton
            compte et entraîne-toi avec les scripts. Le jour où tu passes le cap, tu sauras quoi vendre.
          </Callout>
        ) : null}
      </div>

      <div className="mt-6">
        <KeywordSearchForm remaining={searchesLeft} limit={plan.keywordSearchesPerDay} catalogOnly={!env.nexscopeApiKey} />
      </div>

      <div className="mt-5">
        <RadarFilterBar key={JSON.stringify(filters)} filters={filters} niches={radar.niches} availability={radar.availability} />
      </div>

      <div className="mt-4 space-y-3">
        <RadarToolbar
          view={settings.vue}
          sort={radar.sort}
          order={radar.order}
          sorts={sorts}
          labels={sortLabels}
          query={query}
          count={radar.visibleCount}
          exportHref={plan.radarExport ? `/api/radar/export${query ? `?${query}` : ''}` : null}
        />
        {plan.showScore ? (
          <details id="poids" className="group rounded-2xl border border-line bg-raised" open={false}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
              <span className="inline-flex items-center gap-2">
                <SlidersVertical className="h-4 w-4 text-cyan-ink" aria-hidden="true" />
                {radar.weights ? 'Score calculé avec tes poids' : 'Régler le score'}
              </span>
              {radar.weights ? (
                <span className="num text-xs font-normal text-muted">
                  {SCORE_KEYS.map((k) => `${WEIGHT_LABELS[k]} ${String(weightShares(radar.weights!)[k]).replace('.', ',')}`).join(' · ')}
                </span>
              ) : null}
            </summary>
            <div className="border-t border-line px-4 py-4">
              {plan.customWeights ? (
                <ScoreWeightsForm weights={radar.weights} query={query} />
              ) : (
                <p className="text-sm text-muted">
                  Poids du score réglables avec Elite.{' '}
                  <Link href="/app/passer-pro" className="font-semibold text-rose-ink hover:underline">
                    Passer à Elite
                  </Link>
                </p>
              )}
            </div>
          </details>
        ) : null}
        {plan.compare ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Scale className="h-4 w-4" aria-hidden="true" />
            {favorites.length >= 2 ? (
              <Link href="/app/comparer" className="font-semibold text-cyan-ink hover:underline">
                Comparer mes {favorites.length} favoris
              </Link>
            ) : (
              <span>2 favoris pour comparer</span>
            )}
          </p>
        ) : null}
      </div>

      <div className="mt-5">
        {radar.items.length === 0 ? (
          <EmptyState
            icon={<RadarIcon className="h-5 w-5" />}
            title={radar.filtered ? 'Aucun produit avec ces filtres' : 'Pas encore de produits aujourd’hui'}
            action={
              radar.filtered ? (
                <LinkButton href="/app/radar" variant="outline">
                  Effacer les filtres
                </LinkButton>
              ) : (
                <LinkButton href="/app/compte#niches" variant="outline">
                  Changer mes niches
                </LinkButton>
              )
            }
          >
            {radar.filtered ? null : 'Le radar se remplit chaque nuit.'}
          </EmptyState>
        ) : (
          <>
            {settings.vue === 'liste' ? (
              <RadarTable
                products={visible.flatMap((i) => (i.kind === 'visible' ? [{ rank: i.rank, product: i.product }] : []))}
                sort={radar.sort}
                order={radar.order}
                query={query}
                showScore={plan.showScore}
              />
            ) : (
              <>
                {featured ? (
                  <div className="mb-4">
                    <FeaturedProductCard product={featured.product} action={<LaunchButton productId={featured.product.id} back="/app/radar" label="Lancer ce produit" />} />
                  </div>
                ) : null}

                <ul className="grid gap-1 md:grid-cols-2 2xl:grid-cols-3">
                  {list.map((item) =>
                    item.kind === 'visible' ? (
                      <li key={item.product.id}>
                        <ProductCard product={item.product} rank={item.rank} action={<LaunchButton productId={item.product.id} back="/app/radar" size="sm" label="Lancer ce produit" />} />
                      </li>
                    ) : null,
                  )}
                </ul>
              </>
            )}

            {!paid && radar.lockedCount > 0 ? (
              <section className="mt-4" aria-labelledby="verrouilles">
                <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                  <h2 id="verrouilles" className="text-lg">
                    {plural(radar.lockedCount, 'autre produit', 'autres produits')} à vendre aujourd’hui
                  </h2>
                  <LinkButton href="/abonnement" className="mt-4">
                    Choisir mon abonnement
                  </LinkButton>
                  <ul className="mt-4 grid gap-1 md:grid-cols-2 2xl:grid-cols-3">
                    {radar.items
                      .filter((i) => i.kind === 'locked')
                      .slice(0, 6)
                      .map((item) =>
                        item.kind === 'locked' ? (
                          <li key={item.key}>
                            <LockedProductCard rank={item.rank} niche={item.niche} />
                          </li>
                        ) : null,
                      )}
                  </ul>
                </div>
              </section>
            ) : null}

            {visible.length === 0 && radar.lockedCount > 0 ? (
              <p className="mt-3 text-sm text-muted">
                Tes produits du jour ne correspondent pas à ces filtres.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
