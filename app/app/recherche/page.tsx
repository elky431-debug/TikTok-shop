import type { Metadata } from 'next';
import { ArrowLeft, Search, Store, Users } from 'lucide-react';
import Link from 'next/link';
import { KeywordSearchForm } from '@/components/product/keyword-search-form';
import { ProductImage } from '@/components/product/bits';
import { PlanGate } from '@/components/app/plan-gate';
import { Callout, EmptyState, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getLiveCatalog } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import { env } from '@/lib/env';
import { nicheShort } from '@/lib/niches';
import { type PlanLimits, cheapestPlanWith, getPlan } from '@/lib/plans';
import { remainingSearches, SEARCH_KIND, type SearchRecord } from '@/lib/radar/keyword-search';
import { fallbackImageUrl } from '@/lib/product-image';
import { regionFor } from '@/lib/regions';
import { formatCompact, formatEuros, formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Recherche par mot-clé' };

const ERRORS: Record<string, string> = {
  mot: 'Écris au moins 2 lettres.',
  source: 'La recherche n’a pas abouti chez la source de données. Réessaie dans un moment : rien n’a été décompté.',
};

/** Recherches du jour faites : le plan suivant et son quota (Starter 3, Pro 15, Elite 50). */
function quotaMessage(plan: PlanLimits): string {
  const next = cheapestPlanWith((p) => p.keywordSearchesPerDay > plan.keywordSearchesPerDay);
  const upgrade = next.keywordSearchesPerDay > plan.keywordSearchesPerDay ? `, ou passe à ${next.name} pour en faire ${next.keywordSearchesPerDay} par jour` : '';
  return `Tes ${plan.keywordSearchesPerDay} recherches du jour sont faites : reviens demain${upgrade}.`;
}

export default async function SearchPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/recherche');
  const plan = getPlan(profile.plan);
  if (!plan.keywordSearchesPerDay) {
    return (
      <div>
        <PageHeader eyebrow="Trouver" title="Recherche par mot-clé"  description="Les produits qui contiennent ce mot, triés par ventes sur 7 jours." />
        <PlanGate plan="starter" title="Cherche n’importe quel produit de TikTok Shop">
          Tape un mot-clé (« sérum », « gourde »…) et vois les produits qui se vendent le plus en France sur 7 jours, avec leur
          commission et leur nombre d’affiliés.
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
  const current = searchParams.id ? history.find((r) => r.id === searchParams.id) ?? null : null;
  const inCatalog = new Set(catalog.products.map((p) => p.id));

  return (
    <div>
      <Link href="/app/radar" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Radar
      </Link>
      <PageHeader eyebrow="Trouver"
        title="Recherche par mot-clé"
        description="Les produits qui contiennent ce mot, triés par ventes sur 7 jours."
      />
      <KeywordSearchForm remaining={remaining} limit={plan.keywordSearchesPerDay} defaultValue={current?.data.keyword} catalogOnly={!env.nexscopeApiKey} />
      {searchParams.erreur === 'quota' ? (
        <Callout tone="rose" className="mt-4" title={quotaMessage(plan)} />
      ) : searchParams.erreur && ERRORS[searchParams.erreur] ? (
        <Callout tone="rose" className="mt-4" title={ERRORS[searchParams.erreur]} />
      ) : null}

      {current ? (
        <section className="mt-6" aria-labelledby="resultats">
          <h2 id="resultats" className="text-lg">
            « {current.data.keyword} » : {current.data.results.length} produit{current.data.results.length > 1 ? 's' : ''}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {current.data.source === 'catalogue'
              ? 'Dans le catalogue du jour.'
              : `Source : Nexscope, ${formatRelative(current.created_at)}.`}
            {current.data.skipped ? ` ${current.data.skipped} produit${current.data.skipped > 1 ? 's' : ''} écarté${current.data.skipped > 1 ? 's' : ''} (autre devise, sans commission affiliée…).` : ''}
          </p>
          {current.data.results.length ? (
            <ul className="mt-4 grid gap-2 md:grid-cols-2">
              {current.data.results.map((r) => {
                const open = inCatalog.has(r.id);
                return (
                  <li key={r.id} className="feature-card flex gap-3 p-3.5">
                    <ProductImage src={r.image_url} fallback={fallbackImageUrl(r.id, r.niche ?? 'maison')} alt="" className="w-16 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-semibold leading-snug">{r.name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {[r.niche ? nicheShort(r.niche) : null, r.category.slice(1).join(' › ') || null].filter(Boolean).join(' · ')}
                      </p>
                      <p className="num mt-1 flex flex-wrap gap-x-3 text-sm">
                        <span className="font-semibold">
                          {r.price_min_cents !== null && r.price_max_cents !== null
                            ? `${formatEuros(r.price_min_cents)} à ${formatEuros(r.price_max_cents)}`
                            : formatEuros(r.price_cents)}
                        </span>
                        <span className="font-semibold text-gain">{formatEuros(r.commission_cents)}&nbsp;par vente</span>
                        <span className="text-muted">({Math.round(r.commission_rate * 100)}&nbsp;%)</span>
                      </p>
                      <p className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                        {r.sales_7d !== null ? <span>{formatCompact(r.sales_7d)} ventes sur 7 j</span> : null}
                        {r.sales_month !== null ? <span>{formatCompact(r.sales_month)} sur {r.sales_month_days} j</span> : null}
                        {r.affiliates !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" aria-hidden="true" />
                            {formatCompact(r.affiliates)} affiliés
                          </span>
                        ) : null}
                        {r.rating !== null ? <span>★ {String(r.rating).replace('.', ',')}{r.review_count !== null ? ` (${formatCompact(r.review_count)} avis)` : ''}</span> : null}
                        {r.shop_name ? (
                          <span className="inline-flex items-center gap-1">
                            <Store className="h-3 w-3" aria-hidden="true" />
                            {r.shop_name}
                          </span>
                        ) : null}
                      </p>
                      {open ? (
                        <Link href={`/app/produit/${r.id}`} className="mt-2 inline-block text-sm font-semibold text-cyan-ink hover:underline">
                          Ouvrir la fiche
                        </Link>
                      ) : (
                        <p className="mt-2 text-xs text-muted">Pas dans le radar du jour : pas encore de fiche ni de score.</p>
                      )}
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
