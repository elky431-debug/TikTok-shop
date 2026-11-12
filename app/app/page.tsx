import type { Metadata } from 'next';
import { Sprout } from 'lucide-react';
import { LockedProductCard, FeaturedProductCard, ProductCard } from '@/components/product/product-card';
import { RadarFilterBar } from '@/components/product/radar-filters';
import { LinkButton } from '@/components/ui/button';
import { Callout, EmptyState } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { NICHES, nicheLabel } from '@/lib/niches';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { AFFILIATE_THRESHOLD } from '@/lib/profile-rules';
import { getRadar, parseFilters } from '@/lib/radar';
import { formatDayMonth, formatInt, formatLongDate, plural } from '@/lib/utils';

export const metadata: Metadata = { title: 'Radar' };

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { profile } = await requireOnboardedViewer();
  const filters = parseFilters(searchParams);
  const radar = await getRadar(profile, filters);
  const plan = getPlan(profile.plan);
  const paid = isPaidPlan(profile.plan);
  const welcome = searchParams.bienvenue;

  const visible = radar.items.filter((i) => i.kind === 'visible');
  const [first, ...rest] = radar.items;
  const featured = !radar.filtered && first?.kind === 'visible' ? first : null;
  const list = featured ? rest : radar.items;
  const nicheNames = (radar.niches.length ? radar.niches : NICHES.map((n) => n.id)).map((n) => nicheLabel(n).toLowerCase());

  return (
    <div>
      <div className="mb-5">
        {radar.stale && radar.date ? (
          <p className="inline-flex rounded-full bg-warn-soft px-2.5 py-0.5 text-sm font-semibold text-warn">
            Données du {formatDayMonth(radar.date)}
          </p>
        ) : (
          <p className="text-sm font-medium text-muted">{radar.date ? formatLongDate(radar.date) : 'Aujourd’hui'}</p>
        )}
        <h1 className="mt-1 text-2xl sm:text-3xl">
          {profile.first_name ? `${profile.first_name}, voici` : 'Voici'} tes produits du jour
        </h1>
        <p className="mt-1.5 text-muted">
          {formatInt(radar.totalToday)} produits analysés en {nicheNames.join(', ')}, triés par score.{' '}
          {radar.stale
            ? 'La mise à jour de cette nuit n’a pas abouti : ce sont les derniers relevés disponibles.'
            : 'Mis à jour cette nuit.'}
        </p>
      </div>

      <div className="space-y-3">
        {radar.demo ? (
          <Callout tone="neutral" title="Produits fictifs : démonstration">
            Ces produits n’existent pas sur TikTok Shop : ils montrent comment marche le radar en attendant le
            branchement des vraies données.
          </Callout>
        ) : null}

        {welcome === 'essai' ? (
          <Callout tone="gain" title="Tes 3 mois de Pro sont activés">
            Merci à ton formateur : radar complet, score, 30 scripts par jour et récap Discord. Aucune carte n’a été demandée.
          </Callout>
        ) : welcome ? (
          <Callout tone="cyan" title="Ton radar est prêt">
            Commence par le n°1, ouvre sa fiche, puis écris tes scripts. Objectif : 20 vidéos sur un même produit.
          </Callout>
        ) : null}

        {profile.eligibility === 'preparation' ? (
          <Callout tone="neutral" icon={<Sprout className="h-5 w-5 text-gain" aria-hidden="true" />} title="Mode préparation">
            Tu n’as pas encore {formatInt(AFFILIATE_THRESHOLD)} abonnés : poste déjà sur ces produits pour faire grandir ton
            compte et entraîne-toi avec les scripts. Le jour où tu passes le cap, tu sauras quoi vendre.
          </Callout>
        ) : null}
      </div>

      <div className="mt-6">
        <RadarFilterBar key={JSON.stringify(filters)} filters={filters} niches={radar.niches} />
      </div>

      <div className="mt-5">
        {radar.items.length === 0 ? (
          <EmptyState
            title={radar.filtered ? 'Aucun produit ne correspond à ces filtres' : 'Pas encore de produits aujourd’hui'}
            action={
              radar.filtered ? (
                <LinkButton href="/app" variant="outline">
                  Effacer les filtres
                </LinkButton>
              ) : (
                <LinkButton href="/app/compte#niches" variant="outline">
                  Changer mes niches
                </LinkButton>
              )
            }
          >
            {radar.filtered
              ? 'Élargis la fourchette de prix ou baisse la commission minimum.'
              : 'Le radar se remplit chaque nuit. Reviens dans quelques heures.'}
          </EmptyState>
        ) : (
          <>
            {featured ? (
              <div className="mb-4">
                <FeaturedProductCard product={featured.product} />
              </div>
            ) : null}

            <ul className="grid gap-1 md:grid-cols-2">
              {list.map((item) =>
                item.kind === 'visible' ? (
                  <li key={item.product.id}>
                    <ProductCard product={item.product} rank={item.rank} />
                  </li>
                ) : null,
              )}
            </ul>

            {!paid && radar.lockedCount > 0 ? (
              <section className="mt-4" aria-labelledby="verrouilles">
                <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                  <h2 id="verrouilles" className="text-lg">
                    {plural(radar.lockedCount, 'autre produit', 'autres produits')} à vendre aujourd’hui
                  </h2>
                  <p className="mt-1 max-w-prose text-sm text-muted">
                    Le plan Gratuit montre tes {plan.visibleProducts} meilleurs produits du jour, sans le score. Avec Pro, tu vois
                    tout le radar, le score détaillé, et tu écris jusqu’à 30 scripts par jour.
                  </p>
                  <LinkButton href="/app/passer-pro" className="mt-4">
                    Passer Pro
                  </LinkButton>
                  <ul className="mt-4 grid gap-1 md:grid-cols-2">
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
