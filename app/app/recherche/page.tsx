import type { Metadata } from 'next';
import { ArrowLeft, PenLine, Scale, Search, Star, Users } from 'lucide-react';
import Link from 'next/link';
import { KeywordSearchForm } from '@/components/product/keyword-search-form';
import { ProductImage } from '@/components/product/bits';
import { PlanGate } from '@/components/app/plan-gate';
import { Callout, EmptyState, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getLiveCatalog } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import { env } from '@/lib/env';
import { nicheLabel } from '@/lib/niches';
import { displayName, heuristicShortName } from '@/lib/product-name';
import { scaleFromCatalog, searchScore } from '@/lib/radar/search-products';
import { ScoreValue } from '@/components/product/score';
import { SubmitButton } from '@/components/ui/submit-button';
import { searchCompareAction, searchFollowAction, searchScriptsAction } from './actions';
import { type PlanLimits, cheapestPlanWith, getPlan } from '@/lib/plans';
import { remainingSearches, SEARCH_KIND, type SearchRecord } from '@/lib/radar/keyword-search';
import { fallbackImageUrl } from '@/lib/product-image';
import { regionFor } from '@/lib/regions';
import { cn, formatCompact, formatEuros, formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Recherche par mot-clé' };

const ERRORS: Record<string, string> = {
  produit: 'Ce produit n’est plus dans tes recherches : relance la recherche.',
  mot: 'Écris au moins 2 lettres.',
  source: 'La recherche n’a pas abouti chez la source de données. Réessaie dans un moment : rien n’a été décompté.',
};

const FOLLOW: Record<string, string> = {
  ok: 'Produit suivi : il est dans ton dashboard.',
  retire: 'Tu ne suis plus ce produit.',
  limite: 'Tu suis déjà le maximum de produits de ton plan : retires-en un, ou passe au plan supérieur.',
};

/** Recherches du jour faites : le plan suivant et son quota (Starter 3, Pro 15, Elite 50). */
function quotaMessage(plan: PlanLimits): string {
  const next = cheapestPlanWith((p) => p.keywordSearchesPerDay > plan.keywordSearchesPerDay);
  const upgrade =
    next.keywordSearchesPerDay > plan.keywordSearchesPerDay ? `, ou passe à ${next.name} pour en faire ${next.keywordSearchesPerDay} par jour` : '';
  return `Tes ${plan.keywordSearchesPerDay} recherches du jour sont faites : reviens demain${upgrade}.`;
}

export default async function SearchPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/recherche');
  const plan = getPlan(profile.plan);
  if (!plan.keywordSearchesPerDay) {
    return (
      <div>
        <PageHeader eyebrow="Trouver" title="Recherche par mot-clé" description="Les produits qui contiennent ce mot, triés par ventes sur 7 jours." />
        <PlanGate plan="starter" title="Cherche n’importe quel produit de TikTok Shop">
          Tape un mot-clé (« sérum », « gourde »…) et vois les produits qui se vendent le plus en France sur 7 jours, avec leur commission et leur nombre
          d’affiliés.
        </PlanGate>
      </div>
    );
  }
  const repo = getRepo();
  const [history, remaining, catalog] = await Promise.all([
    repo.listRecords<SearchRecord>(profile.id, SEARCH_KIND),
    remainingSearches(profile),
    getLiveCatalog(repo, new Date(), regionFor(profile)),
  ]);
  const current = searchParams.id ? (history.find((r) => r.id === searchParams.id) ?? null) : null;
  const ids = current?.data.results.map((r) => r.id) ?? [];
  const [known, saved] = await Promise.all([repo.getProducts(ids), repo.listSavedProducts(profile.id)]);
  const catalogById = new Map(known.map((p) => [p.id, p]));
  const savedIds = new Set(saved.map((x) => x.product_id));
  const scale = scaleFromCatalog(catalog.products);

  return (
    <div>
      <Link href="/app/radar" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Radar
      </Link>
      <PageHeader eyebrow="Trouver" title="Recherche par mot-clé" description="Les produits qui contiennent ce mot, triés par ventes sur 7 jours." />
      <KeywordSearchForm remaining={remaining} limit={plan.keywordSearchesPerDay} defaultValue={current?.data.keyword} catalogOnly={!env.nexscopeApiKey} />
      {searchParams.erreur === 'quota' ? (
        <Callout tone="rose" className="mt-4" title={quotaMessage(plan)} />
      ) : searchParams.erreur && ERRORS[searchParams.erreur] ? (
        <Callout tone="rose" className="mt-4" title={ERRORS[searchParams.erreur]} />
      ) : null}

      {searchParams.suivi && FOLLOW[searchParams.suivi] ? (
        <Callout tone={searchParams.suivi === 'limite' ? 'warn' : 'gain'} className="mt-4" title={FOLLOW[searchParams.suivi]} />
      ) : null}

      {current ? (
        <section className="mt-6" aria-labelledby="resultats">
          <h2 id="resultats" className="text-lg">
            « {current.data.keyword} » : {current.data.results.length} produit{current.data.results.length > 1 ? 's' : ''}
          </h2>
          {current.data.fallback ? <p className="mt-1 text-sm text-muted">Source indisponible pour le moment : résultats tirés du radar du jour.</p> : null}
          {current.data.results.length ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {current.data.results.map((r, i) => {
                const known = catalogById.get(r.id);
                const name = r.short_name ?? (known ? displayName(known) : heuristicShortName(r.name));
                const niche = (r.niche_checked || !known ? r.niche : known.niche) ?? null;
                const score = plan.showScore ? (known ? known.latest_score : searchScore(r, scale)) : null;
                const followed = savedIds.has(r.id);
                return (
                  <li
                    key={r.id}
                    id={`r-${r.id}`}
                    className="group relative animate-fade-up rounded-2xl border border-line bg-raised p-3.5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_0_40px_-16px_rgb(var(--cyan)/0.35)] motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                  >
                    <Link
                      href={`/app/produit/${encodeURIComponent(r.id)}`}
                      className="absolute inset-0 z-0 rounded-2xl"
                      aria-label={`Ouvrir la fiche de ${name}`}
                    />
                    <div className="pointer-events-none relative flex gap-3">
                      <ProductImage src={r.image_url} fallback={fallbackImageUrl(r.id, niche ?? 'maison')} alt="" className="w-20 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 font-semibold leading-snug">{name}</p>
                          {score !== null ? <ScoreValue score={score} size="sm" showMax={false} className="shrink-0" /> : null}
                        </div>
                        {niche ? <p className="mt-0.5 text-xs text-muted">{nicheLabel(niche)}</p> : null}
                        <p className="num mt-1.5 flex flex-wrap items-baseline gap-x-3 text-sm">
                          <span className="font-semibold">
                            {r.price_min_cents !== null && r.price_max_cents !== null
                              ? `${formatEuros(r.price_min_cents)} à ${formatEuros(r.price_max_cents)}`
                              : formatEuros(r.price_cents)}
                          </span>
                          <span className="font-semibold text-gain">{formatEuros(r.commission_cents)}&nbsp;par vente</span>
                          <span className="text-xs text-muted">{Math.round(r.commission_rate * 100)}&nbsp;%</span>
                        </p>
                        <p className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                          {r.sales_7d !== null ? <span>{formatCompact(r.sales_7d)} ventes sur 7 j</span> : null}
                          {r.affiliates !== null ? (
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" aria-hidden="true" />
                              {formatCompact(r.affiliates)} affiliés
                            </span>
                          ) : null}
                          {r.rating !== null ? <span>★ {String(r.rating).replace('.', ',')}</span> : null}
                        </p>
                      </div>
                    </div>
                    <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2 transition-opacity lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100">
                      <form action={searchScriptsAction}>
                        <input type="hidden" name="produit" value={r.id} />
                        <input type="hidden" name="recherche" value={current.id} />
                        <SubmitButton size="sm" pendingLabel="Ouverture…" className="px-3.5">
                          <PenLine className="h-4 w-4" aria-hidden="true" />
                          Écrire mes scripts
                        </SubmitButton>
                      </form>
                      <form action={searchFollowAction}>
                        <input type="hidden" name="produit" value={r.id} />
                        <input type="hidden" name="recherche" value={current.id} />
                        <button
                          type="submit"
                          aria-pressed={followed}
                          aria-label={followed ? `Ne plus suivre ${name}` : `Suivre ${name}`}
                          title={followed ? 'Suivi : ne plus suivre' : 'Suivre ce produit'}
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                            followed ? 'border-cyan-ink/40 bg-cyan-soft text-cyan-ink' : 'border-line text-muted hover:bg-surface hover:text-fg',
                          )}
                        >
                          <Star className={cn('h-4 w-4', followed && 'fill-current')} aria-hidden="true" />
                        </button>
                      </form>
                      <form action={searchCompareAction}>
                        <input type="hidden" name="produit" value={r.id} />
                        <input type="hidden" name="recherche" value={current.id} />
                        <button
                          type="submit"
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface hover:text-fg"
                        >
                          <Scale className="h-4 w-4" aria-hidden="true" />
                          Comparer
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={<Search className="h-5 w-5" />} title="Aucun produit trouvé" className="mt-4">
              Essaie un mot plus court.
            </EmptyState>
          )}
        </section>
      ) : null}

      {history.length ? (
        <section className="mt-8" aria-labelledby="historique">
          <h2 id="historique" className="text-base">
            Tes dernières recherches
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {history.slice(0, 10).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/recherche?id=${r.id}`}
                  aria-current={r.id === current?.id ? 'page' : undefined}
                  className="inline-flex h-9 items-center rounded-full border border-line-strong px-3 text-sm hover:bg-surface aria-[current=page]:bg-surface"
                >
                  {r.data.keyword}
                  <span className="ml-1.5 text-xs text-muted">{formatRelative(r.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
