import type { Metadata } from 'next';
import { Download, Star } from 'lucide-react';
import Link from 'next/link';
import { Card, Callout, EmptyState, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { formatLabel } from '@/lib/ai/formats';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { getUsageToday, listStudioProducts } from '@/lib/studio';
import { cn, formatRelative } from '@/lib/utils';
import { StudioForm } from './studio-form';

export const metadata: Metadata = { title: 'Studio de scripts' };

export default async function StudioPage({ searchParams }: { searchParams: { produit?: string; gardes?: string; supprime?: string } }) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const repo = getRepo();
  const [products, usage, history] = await Promise.all([
    listStudioProducts(profile),
    getUsageToday(profile),
    repo.listScripts(profile.id, { limit: 30, savedOnly: searchParams.gardes === '1' }),
  ]);
  const plan = getPlan(profile.plan);
  const names = new Map((await repo.getProducts([...new Set(history.map((h) => h.product_id))])).map((p) => [p.id, p.name]));
  const all = [...products.today, ...products.saved];
  const selected = all.some((p) => p.id === searchParams.produit) ? searchParams.produit : undefined;

  return (
    <div>
      <PageHeader
        title="Studio de scripts"
        description="10 accroches et 3 scripts complets de 20 à 40 secondes, écrits pour ton style. Tu choisis, tu tournes."
      />

      {searchParams.supprime ? (
        <Callout tone="neutral" className="mb-4">
          Script supprimé.
        </Callout>
      ) : null}

      <Card className="sm:p-6">
        <StudioForm
          today={products.today.map((p) => ({ id: p.id, name: p.name }))}
          saved={products.saved.map((p) => ({ id: p.id, name: p.name }))}
          selected={selected}
          remaining={usage.remaining}
          disabled={usage.remaining <= 0}
        />
      </Card>

      <section className="mt-10" aria-labelledby="historique">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="historique" className="text-xl">
            Historique
          </h2>
          <div className="flex items-center gap-1 text-sm">
            <Link
              href="/app/studio"
              className={cn('rounded-full px-3 py-1.5 font-semibold', searchParams.gardes !== '1' ? 'bg-surface text-fg' : 'text-muted hover:text-fg')}
            >
              Tous
            </Link>
            <Link
              href="/app/studio?gardes=1"
              className={cn('rounded-full px-3 py-1.5 font-semibold', searchParams.gardes === '1' ? 'bg-surface text-fg' : 'text-muted hover:text-fg')}
            >
              Gardés
            </Link>
            {plan.export ? (
              <a href="/app/studio/export" className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-semibold hover:bg-surface">
                <Download className="h-4 w-4" aria-hidden="true" />
                Exporter
              </a>
            ) : null}
          </div>
        </div>

        {history.length === 0 ? (
          <EmptyState title={searchParams.gardes === '1' ? 'Aucun script gardé' : 'Pas encore de scripts'}>
            {searchParams.gardes === '1'
              ? 'Ouvre un script et appuie sur « Garder ce script » pour le retrouver ici.'
              : 'Choisis un produit et un format ci-dessus, puis appuie sur « Écrire mes scripts ».'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {history.map((item) => (
              <li key={item.id}>
                <Link href={`/app/studio/${item.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{names.get(item.product_id) ?? 'Produit retiré'}</p>
                    <p className="text-sm text-muted">
                      {formatLabel(item.format)} · {formatRelative(item.created_at)}
                    </p>
                  </div>
                  {item.saved ? <Star className="h-4 w-4 shrink-0 fill-current text-fg" aria-label="Gardé" /> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
