import type { Metadata } from 'next';
import { ArrowLeft, Rocket } from 'lucide-react';
import Link from 'next/link';
import { StepFrame } from '@/components/launch/step-frame';
import { LaunchTimeline } from '@/components/launch/timeline';
import { ProductImage } from '@/components/product/product-image';
import { ScoreValue } from '@/components/product/score';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, EmptyState } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getLiveCatalog } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import type { Product } from '@/lib/db/types';
import { nicheShort } from '@/lib/niches';
import { getPlan } from '@/lib/plans';
import { fallbackImageUrl } from '@/lib/product-image';
import { displayName } from '@/lib/product-name';
import { rankForUser } from '@/lib/radar-rules';
import { SEARCH_KIND, type SearchRecord } from '@/lib/radar/keyword-search';
import { scaleFromCatalog, searchScore } from '@/lib/radar/search-products';
import { FAVORITES_KIND } from '@/lib/radar/settings';
import { regionFor } from '@/lib/regions';
import { commissionPerSale } from '@/lib/score';
import { cn, formatEuros } from '@/lib/utils';
import { launchHref } from '@/lib/v2/launch';
import { listLaunches } from '@/lib/v2/launch-store';
import { startLaunchAction } from '../actions';

export const metadata: Metadata = { title: 'Choisir un produit à lancer' };

type Source = 'radar' | 'recherche' | 'favoris';
const SOURCES: Array<{ id: Source; label: string }> = [
  { id: 'radar', label: 'Radar du jour' },
  { id: 'recherche', label: 'Ma dernière recherche' },
  { id: 'favoris', label: 'Mes favoris' },
];

interface Choice {
  id: string;
  name: string;
  niche: string;
  image: string;
  fallback: string;
  score: number | null;
  commissionCents: number;
  priceCents: number;
}

function fromProduct(p: Product): Choice {
  return {
    id: p.id,
    name: displayName(p),
    niche: nicheShort(p.niche),
    image: p.image_url,
    fallback: fallbackImageUrl(p.id, p.niche),
    score: p.latest_score,
    commissionCents: commissionPerSale(p.price_cents, p.commission_rate),
    priceCents: p.price_cents,
  };
}

/** Étape 1 du lancement : choisir le produit dans le radar, la dernière recherche ou les favoris. */
export default async function ChooseProductPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/lancer/nouveau');
  const repo = getRepo();
  const plan = getPlan(profile.plan);
  const source: Source = searchParams.source === 'recherche' || searchParams.source === 'favoris' ? searchParams.source : 'radar';
  const catalog = (await getLiveCatalog(repo, new Date(), regionFor(profile))).products;
  const open = new Map((await listLaunches(repo, profile.id)).filter((l) => l.data.state === 'en_cours').map((l) => [l.data.product_id, l.id]));

  let choices: Choice[] = [];
  let keyword: string | null = null;
  if (source === 'radar') {
    choices = rankForUser(catalog, profile.niches).slice(0, 12).map(fromProduct);
  } else if (source === 'favoris') {
    const [record] = await repo.listRecords<{ ids: string[] }>(profile.id, FAVORITES_KIND);
    choices = (await repo.getProducts(record?.data.ids ?? [])).map(fromProduct);
  } else {
    const [record] = await repo.listRecords<SearchRecord>(profile.id, SEARCH_KIND);
    keyword = record?.data.keyword ?? null;
    const scale = scaleFromCatalog(catalog);
    choices = (record?.data.results ?? []).slice(0, 12).map((r) => ({
      id: r.id,
      name: r.short_name || displayName({ name: r.name }),
      niche: r.niche ? nicheShort(r.niche) : '',
      image: r.image_url,
      fallback: fallbackImageUrl(r.id, r.niche ?? 'maison'),
      score: searchScore(r, scale),
      commissionCents: r.commission_cents,
      priceCents: r.price_cents,
    }));
  }

  const back = `/app/lancer/nouveau?source=${source}`;
  return (
    <div>
      <Link href="/app/lancer" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Lancer un produit
      </Link>
      <LaunchTimeline id={null} done={[]} viewing="produit" />
      {searchParams.lancement === 'limite' ? (
        <Callout tone="warn" className="mb-6" title={`Tu suis déjà ${plan.savedProducts} produits, la limite de ton plan.`}>
          Termine ou abandonne un lancement (ou retire un produit suivi) pour en lancer un nouveau.
        </Callout>
      ) : null}
      {searchParams.lancement === 'introuvable' ? <Callout tone="rose" className="mb-6" title="Ce produit n’est plus disponible : choisis-en un autre." /> : null}

      <StepFrame step="produit" sentence="Prends un produit qui monte dans tes niches : tu vas lui consacrer une série de vidéos.">
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="D’où vient le produit">
          {SOURCES.map((s) => (
            <Link
              key={s.id}
              href={`/app/lancer/nouveau?source=${s.id}`}
              role="tab"
              aria-selected={s.id === source}
              className={cn(
                'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors',
                s.id === source ? 'bg-fg text-bg' : 'border border-line text-muted hover:text-fg',
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>
        {source === 'recherche' && keyword ? <p className="mb-4 text-sm text-muted">Résultats pour « {keyword} ».</p> : null}

        {choices.length ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {choices.map((c) => {
              const launchId = open.get(c.id);
              return (
                <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-raised p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <ProductImage src={c.image} fallback={c.fallback} alt="" className="h-16 w-16 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/produit/${encodeURIComponent(c.id)}`} className="line-clamp-2 font-semibold leading-snug hover:underline hover:underline-offset-4">
                        {c.name}
                      </Link>
                      {c.niche ? <p className="text-xs text-muted">{c.niche}</p> : null}
                      <p className="num mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span>{formatEuros(c.priceCents)}</span>
                        <span className="font-semibold text-gain">{formatEuros(c.commissionCents)} / vente</span>
                      </p>
                    </div>
                    <ScoreValue score={c.score} locked={!plan.showScore} size="sm" showMax={false} />
                  </div>
                  {launchId ? (
                    <Link
                      href={launchHref(launchId)}
                      className="mt-auto inline-flex h-10 items-center justify-center rounded-xl border border-line text-sm font-semibold hover:bg-surface"
                    >
                      Reprendre son lancement
                    </Link>
                  ) : (
                    <form action={startLaunchAction} className="mt-auto">
                      <input type="hidden" name="produit" value={c.id} />
                      <input type="hidden" name="retour" value={back} />
                      <SubmitButton className="w-full" pendingLabel="Lancement…">
                        <Rocket className="h-4 w-4" aria-hidden="true" />
                        Lancer ce produit
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title={source === 'favoris' ? 'Pas encore de favori' : source === 'recherche' ? 'Pas encore de recherche' : 'Le radar est vide pour le moment'}
          >
            {source === 'favoris' ? (
              <>Ajoute des favoris depuis le radar ou la fiche d’un produit.</>
            ) : source === 'recherche' ? (
              <>
                Cherche un produit par mot-clé dans la{' '}
                <Link href="/app/recherche" className="font-semibold text-fg underline underline-offset-2">
                  recherche
                </Link>
                , puis reviens ici.
              </>
            ) : (
              <>Les produits du jour arrivent après le relevé de la nuit.</>
            )}
          </EmptyState>
        )}
      </StepFrame>
    </div>
  );
}
