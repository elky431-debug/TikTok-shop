import type { Metadata } from 'next';
import { ArrowLeft, Star } from 'lucide-react';
import Link from 'next/link';
import { toggleFavoriteAction } from '@/app/app/actions';
import { PlanGate } from '@/components/app/plan-gate';
import { ProductBadges, WhyNowLine } from '@/components/product/badges';
import { ProductImage, TrendBadge } from '@/components/product/bits';
import { ScoreValue } from '@/components/product/score';
import { Button } from '@/components/ui/button';
import { Callout, EmptyState, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getLiveCatalog } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { scoresFor, toProductView, type ProductView } from '@/lib/radar';
import { bestValue, MAX_COMPARE, parseCompareIds } from '@/lib/radar/compare';
import { getFavorites, getRadarSettings } from '@/lib/radar/settings';
import { readWhyNow } from '@/lib/radar/why-now';
import { regionFor } from '@/lib/regions';
import { cn, formatCompact, formatEuros, formatGrowth, formatShortDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Comparer' };

type Row = {
  label: string;
  value: (p: ProductView) => React.ReactNode;
  /** Valeur comparée pour marquer le meilleur (null = inconnue). */
  rank?: (p: ProductView) => number | null;
  /** true = le plus petit est le meilleur (affiliés : moins de concurrence). */
  lowerIsBetter?: boolean;
  /** Ligne affichée seulement si au moins un produit a la donnée. */
  has?: (p: ProductView) => boolean;
};

const ROWS: Row[] = [
  { label: 'Score', value: (p) => <ScoreValue score={p.score} size="sm" showMax={false} />, rank: (p) => p.score },
  { label: 'Score pour toi', value: (p) => p.personal_score ?? '—', rank: (p) => p.personal_score, has: (p) => p.personal_score !== null },
  { label: 'Pourquoi maintenant', value: (p) => <WhyNowLine whyNow={p.why_now} compact />, has: (p) => p.why_now !== null },
  { label: 'Prix', value: (p) => formatEuros(p.price_cents) },
  { label: 'Commission', value: (p) => `${Math.round(p.commission_rate * 100)} %`, rank: (p) => p.commission_rate },
  { label: 'Par vente', value: (p) => <span className="font-semibold text-gain">{formatEuros(p.commission_cents)}</span>, rank: (p) => p.commission_cents },
  {
    label: 'Ventes 7 jours',
    value: (p) => (p.figures.sales_7d === null ? '—' : formatCompact(p.figures.sales_7d)),
    rank: (p) => p.figures.sales_7d,
    has: (p) => p.figures.sales_7d !== null,
  },
  {
    label: 'Ventes 30 jours',
    value: (p) => (p.figures.sales_30d === null ? '—' : formatCompact(p.figures.sales_30d)),
    rank: (p) => p.figures.sales_30d,
    has: (p) => p.figures.sales_30d !== null,
  },
  {
    label: 'Tendance',
    value: (p) => <TrendBadge trend={p.trend} growth={p.figures.growth_7d ?? undefined} measured={p.growth_known} />,
    rank: (p) => p.figures.growth_7d,
  },
  {
    label: 'Affiliés',
    value: (p) => (p.active_affiliates === null ? '—' : formatCompact(p.active_affiliates)),
    rank: (p) => p.active_affiliates,
    lowerIsBetter: true,
    has: (p) => p.active_affiliates !== null,
  },
  {
    label: 'Note',
    value: (p) =>
      p.figures.rating === null ? '—' : `★ ${String(p.figures.rating).replace('.', ',')}${p.figures.review_count !== null ? ` (${formatCompact(p.figures.review_count)} avis)` : ''}`,
    rank: (p) => p.figures.rating,
    has: (p) => p.figures.rating !== null,
  },
  {
    label: 'Premier relevé',
    value: (p) => (p.figures.first_seen ? formatShortDate(p.figures.first_seen) : '—'),
    has: (p) => p.figures.first_seen !== null,
  },
  { label: 'Signaux', value: (p) => <ProductBadges badges={p.badges} trend={p.trend} growthKnown={p.growth_known} />, has: (p) => p.badges.length > 0 },
  { label: 'Boutique', value: (p) => p.shop_name || '—', has: (p) => Boolean(p.shop_name) },
];

export default async function ComparePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/comparer');
  const plan = getPlan(profile.plan);
  if (!plan.compare) {
    return (
      <div>
        <PageHeader title="Comparer des produits" />
        <PlanGate plan="Pro" title="Compare 2 à 4 produits côte à côte">
          Score, commission, ventes, affiliés, note : tout sur une seule page pour choisir le produit de tes 20 prochaines vidéos.
        </PlanGate>
      </div>
    );
  }

  const repo = getRepo();
  const region = regionFor(profile);
  const [favorites, saved, settings, catalog] = await Promise.all([
    getFavorites(profile.id, repo),
    repo.listSavedProducts(profile.id),
    getRadarSettings(profile.id, repo),
    getLiveCatalog(repo, new Date(), region),
  ]);
  const candidateIds = [...new Set([...favorites, ...saved.map((s) => s.product_id)])];
  const selected = parseCompareIds(searchParams.ids);
  const chosen = (selected.length ? selected : favorites).slice(0, MAX_COMPARE);
  const products = await repo.getProducts([...new Set([...candidateIds, ...chosen])]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const scores = scoresFor(catalog.products, profile, settings);
  const whyNow = catalog.dataDate ? await readWhyNow(region, catalog.dataDate, repo) : {};
  const savedIds = new Set(saved.map((s) => s.product_id));
  const favoriteIds = new Set(favorites);
  const view = (id: string) => {
    const product = byId.get(id);
    return product
      ? toProductView(product, profile.plan, savedIds.has(id), { scores: scores.get(id), whyNow: whyNow[id] ?? null, favorite: favoriteIds.has(id) })
      : null;
  };
  const compared = chosen.map(view).filter((v): v is ProductView => v !== null);
  const candidates = candidateIds.map(view).filter((v): v is ProductView => v !== null);
  const rows = ROWS.filter((r) => !r.has || compared.some(r.has));
  const best = (row: Row) => (row.rank ? bestValue(compared.map(row.rank), row.lowerIsBetter) : null);
  const back = `/app/comparer${chosen.length ? `?ids=${chosen.join(',')}` : ''}`;

  return (
    <div>
      <Link href="/app/radar" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Radar
      </Link>
      <PageHeader
        title="Comparer des produits"
        description="Choisis 2 à 4 produits parmi tes favoris et tes produits suivis. Le meilleur chiffre de chaque ligne est marqué ; une donnée que la source ne donne pas reste vide."
      />

      {candidates.length < 2 ? (
        <EmptyState title="Il te faut au moins 2 produits" className="mb-6">
          Mets des produits en favori (étoile dans la vue liste du radar, ou sur leur fiche), ou ajoute-les à Mes produits, puis reviens ici.
        </EmptyState>
      ) : (
        <form method="get" action="/app/comparer" className="mb-6 rounded-2xl border border-line bg-raised p-4">
          <fieldset>
            <legend className="text-sm font-semibold">Produits à comparer (4 au plus)</legend>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {candidates.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 hover:border-line-strong has-[:checked]:border-cyan-ink/50">
                    <input type="checkbox" name="ids" value={p.id} defaultChecked={chosen.includes(p.id)} className="h-4 w-4 accent-[#25F4EE]" />
                    <span className="line-clamp-1 text-sm font-medium">{p.name}</span>
                    {p.favorite ? <Star className="ml-auto h-3.5 w-3.5 shrink-0 fill-current text-cyan-ink" aria-label="Favori" /> : null}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <Button type="submit" variant="outline" size="sm" className="mt-3">
            Comparer
          </Button>
        </form>
      )}

      {selected.length > MAX_COMPARE ? <Callout tone="warn" className="mb-4" title="4 produits au plus : les premiers ont été gardés." /> : null}

      {compared.length >= 2 ? (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="num w-full min-w-[36rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 w-32 bg-bg px-2 py-2 text-left align-bottom text-xs font-semibold text-muted">
                  <span className="sr-only">Critère</span>
                </th>
                {compared.map((p) => (
                  <th key={p.id} scope="col" className="min-w-[10rem] px-2 py-2 text-left align-top font-normal">
                    <ProductImage src={p.image_url} fallback={p.image_fallback} alt="" className="w-16" />
                    <Link href={`/app/produit/${p.id}`} className="mt-2 line-clamp-3 block font-semibold leading-snug hover:underline">
                      {p.name}
                    </Link>
                    <form action={toggleFavoriteAction} className="mt-1">
                      <input type="hidden" name="produit" value={p.id} />
                      <input type="hidden" name="retour" value={back} />
                      <button type="submit" className="text-xs font-semibold text-muted hover:text-fg">
                        {p.favorite ? 'Retirer des favoris' : 'Mettre en favori'}
                      </button>
                    </form>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const top = best(row);
                return (
                  <tr key={row.label}>
                    <th scope="row" className="sticky left-0 z-10 border-t border-line bg-bg px-2 py-2.5 text-left text-xs font-semibold text-muted">
                      {row.label}
                    </th>
                    {compared.map((p) => {
                      const value = row.rank?.(p) ?? null;
                      const isBest = top !== null && value === top;
                      return (
                        <td key={p.id} className={cn('border-t border-line px-2 py-2.5 align-top', isBest && 'bg-cyan-ink/[0.06]')}>
                          {row.value(p)}
                          {isBest ? <span className="ml-1.5 text-xs font-semibold text-cyan-ink">meilleur</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : candidates.length >= 2 ? (
        <p className="text-sm text-muted">Coche au moins 2 produits pour les voir côte à côte.</p>
      ) : null}
    </div>
  );
}
