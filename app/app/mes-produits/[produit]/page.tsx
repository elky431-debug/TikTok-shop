import type { Metadata } from 'next';
import { ArrowLeft, CalendarDays, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeclineCallout } from '@/components/v2/decline-callout';
import { VideoBoard } from '@/components/v2/video-board';
import { LinkButton } from '@/components/ui/button';
import { Callout, Card, PageHeader, ProgressBar } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { formatCompact, formatInt, formatShortDate, parisDate } from '@/lib/utils';
import { loadMyProducts } from '@/lib/v2/my-products';
import { planProgress } from '@/lib/v2/planning';
import { displayName } from '@/lib/product-name';

export const metadata: Metadata = { title: 'Tableau des vidéos' };

export default async function ProductBoardPage({ params, searchParams }: { params: { produit: string }; searchParams: Record<string, string | undefined> }) {
  const productId = decodeURIComponent(params.produit);
  const { profile } = await requireOnboardedViewer(`/app/mes-produits/${encodeURIComponent(productId)}`);
  const today = parisDate();
  const { rows, paid } = await loadMyProducts(getRepo(), profile, today);
  const row = rows.find((r) => r.product.id === productId);
  if (!row) notFound();
  const { product, board } = row;
  const plan = board.data;
  const progress = planProgress(plan);
  const posted = plan.items.filter((i) => i.status === 'poste').sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? '') || b.n - a.n);
  const totalViews = posted.reduce((s, i) => s + (i.views ?? 0), 0);
  const totalSales = posted.reduce((s, i) => s + (i.sales ?? 0), 0);
  const openVideo = Number(searchParams.video) || undefined;
  const canPlan = getPlan(profile.plan).planning;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/app/mes-produits" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Mes produits
      </Link>
      <PageHeader eyebrow="Suivre"
        title={<span className="line-clamp-2">{displayName(product)}</span>}
        description={`${progress.posted} vidéo${progress.posted > 1 ? 's' : ''} postée${progress.posted > 1 ? 's' : ''} sur ${progress.total}. Glisse chaque vidéo d’une colonne à l’autre au fil du tournage.`}
        actions={
          <>
            <LinkButton href={`/app/studio?produit=${encodeURIComponent(product.id)}`} size="sm">
              Écrire mes scripts
            </LinkButton>
            <LinkButton href={canPlan ? `/app/plan?produit=${encodeURIComponent(product.id)}#nouveau` : '/app/plan'} variant="outline" size="sm">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {plan.rhythm ? 'Voir le calendrier' : 'Planifier les vidéos'}
            </LinkButton>
          </>
        }
      />
      {searchParams.ok === 'details' ? <Callout tone="gain" className="mb-4" title={`Chiffres de la vidéo n°${openVideo ?? ''} enregistrés.`} /> : null}
      {searchParams.erreur === 'lien' ? (
        <Callout tone="rose" className="mb-4" title="Ce lien n’est pas valide : colle l’adresse complète de la vidéo (https://…)." />
      ) : null}

      <ProgressBar value={progress.posted} max={progress.total} label={`Vidéos postées sur ${product.name}`} className="mb-5" />

      {row.declining ? <DeclineCallout product={product} replacements={row.replacements} paid={paid} className="mb-5" /> : null}

      <VideoBoard productId={product.id} productName={displayName(product)} items={plan.items} today={today} openVideo={openVideo} />

      <Card className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg">Vidéos en ligne</h2>
          {posted.length ? (
            <p className="num text-sm text-muted">
              {formatCompact(totalViews)} vues · {formatInt(totalSales)} ventes (saisies par toi)
            </p>
          ) : null}
        </div>
        {posted.length ? (
          <div className="-mx-4 mt-3 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium sm:px-2">Vidéo</th>
                  <th scope="col" className="px-2 py-2 font-medium">Date</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Vues</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Ventes</th>
                  <th scope="col" className="px-4 py-2 font-medium sm:px-2">Lien</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {posted.map((item) => (
                  <tr key={item.n}>
                    <td className="px-4 py-2 font-semibold sm:px-2">
                      <Link href={`?video=${item.n}#video-${item.n}`} className="hover:underline">
                        n°{item.n}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-muted">{item.posted_at ? formatShortDate(item.posted_at) : '—'}</td>
                    <td className="num px-2 py-2 text-right">{item.views != null ? formatCompact(item.views) : '—'}</td>
                    <td className="num px-2 py-2 text-right">{item.sales != null ? formatInt(item.sales) : '—'}</td>
                    <td className="px-4 py-2 sm:px-2">
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-cyan-ink hover:underline">
                          Ouvrir <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          <span className="sr-only">la vidéo n°{item.n} (nouvel onglet)</span>
                        </a>
                      ) : (
                        <Link href={`?video=${item.n}#video-${item.n}`} className="text-muted hover:text-fg">
                          Ajouter
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Quand une vidéo est en ligne, glisse-la dans « Posté » et note son lien, ses vues et ses ventes.</p>
        )}
      </Card>
    </div>
  );
}
