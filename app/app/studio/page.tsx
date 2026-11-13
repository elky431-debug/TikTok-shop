import type { Metadata } from 'next';
import { BadgeCheck, Download, Layers, Star } from 'lucide-react';
import Link from 'next/link';
import { StudioNav } from '@/components/studio/studio-nav';
import { Card, Callout, EmptyState, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { angleLabel, formatLabel, toneLabel } from '@/lib/ai/formats';
import { getUsageToday, latestSettings, listStudioProducts, studioRights } from '@/lib/studio';
import { collectFeedback } from '@/lib/studio/feedback';
import { listDocs, listHistory, type HistoryItem } from '@/lib/studio/store';
import { getStyle } from '@/lib/studio/style';
import { cn, formatRelative } from '@/lib/utils';
import { StudioForm } from './studio-form';

export const metadata: Metadata = { title: 'Studio de scripts' };

const FILTERS = [
  { id: 'tous', label: 'Tous', href: '/app/studio' },
  { id: 'gardes', label: 'Favoris', href: '/app/studio?gardes=1' },
  { id: 'vendu', label: 'Ont vendu', href: '/app/studio?vendu=1' },
] as const;

const PAGE = 30;

export default async function StudioPage({
  searchParams,
}: {
  searchParams: { produit?: string; gardes?: string; vendu?: string; supprime?: string; plus?: string };
}) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const rights = studioRights(profile.plan);
  const [products, usage, history, docs, style, settings] = await Promise.all([
    listStudioProducts(profile),
    getUsageToday(profile),
    listHistory(profile.id),
    listDocs(profile.id),
    rights.personalStyle ? getStyle(profile.id) : Promise.resolve(null),
    latestSettings(profile),
  ]);
  const filter = searchParams.gardes === '1' ? 'gardes' : searchParams.vendu === '1' ? 'vendu' : 'tous';
  const filtered = history.filter((h) => (filter === 'gardes' ? h.saved : filter === 'vendu' ? h.sold : true));
  const shown = searchParams.plus === '1' ? filtered.slice(0, 300) : filtered.slice(0, PAGE);
  const all = [...products.today, ...products.saved];
  const selected = all.some((p) => p.id === searchParams.produit) ? searchParams.produit : undefined;
  const feedbackCount = collectFeedback(docs).best.length;

  return (
    <div>
      <PageHeader eyebrow="Créer"
        title="Studio de scripts"
        description="10 accroches et 3 scripts complets, plan par plan, écrits pour ton style. Tu choisis, tu tournes avec le téléprompteur."
      />
      <StudioNav active="ecrire" />

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
          settings={settings}
          style={!rights.personalStyle ? 'verrouille' : !style ? 'absent' : style.data.enabled ? 'actif' : 'inactif'}
          feedbackCount={feedbackCount}
        />
      </Card>

      <section className="mt-10" aria-labelledby="historique">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="historique" className="text-xl">
            Historique
          </h2>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={f.href}
                aria-current={filter === f.id ? 'page' : undefined}
                className={cn('rounded-full px-3 py-1.5 font-semibold', filter === f.id ? 'bg-surface text-fg' : 'text-muted hover:text-fg')}
              >
                {f.label}
              </Link>
            ))}
            {rights.export ? (
              <a href="/app/studio/export" className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-semibold hover:bg-surface">
                <Download className="h-4 w-4" aria-hidden="true" />
                Exporter tout
              </a>
            ) : null}
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState title={filter === 'gardes' ? 'Aucun favori' : filter === 'vendu' ? 'Aucun script qui a vendu, pour l’instant' : 'Pas encore de scripts'}>
            {filter === 'gardes'
              ? 'Ouvre un script et appuie sur « Garder ce script » pour le retrouver ici.'
              : filter === 'vendu'
                ? 'Après avoir posté une vidéo, ouvre son script et réponds à « Il a vendu ? ». Ces scripts servent d’exemple aux suivants.'
                : 'Choisis un produit, un format et tes réglages ci-dessus, puis appuie sur « Écrire mes scripts ».'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-raised">
            {shown.map((item) => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </ul>
        )}
        {filtered.length > shown.length ? (
          <p className="mt-3 text-center">
            <Link
              href={`/app/studio?${filter === 'gardes' ? 'gardes=1&' : filter === 'vendu' ? 'vendu=1&' : ''}plus=1#historique`}
              className="text-sm font-semibold text-cyan-ink underline underline-offset-2"
            >
              Afficher les {filtered.length - shown.length} plus anciens
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const details = [
    formatLabel(item.format),
    item.settings ? `${item.settings.duration} s` : null,
    item.settings ? toneLabel(item.settings.tone).toLowerCase() : null,
    item.settings && item.settings.angle !== 'varie' ? angleLabel(item.settings.angle).toLowerCase() : null,
  ].filter(Boolean);
  return (
    <li>
      <Link href={`/app/studio/${item.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.product_name}</p>
          <p className="truncate text-sm text-muted">
            {details.join(' · ')} · {formatRelative(item.generated_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {item.series ? <Layers className="h-4 w-4 text-muted" aria-label="Série de 20" /> : null}
          {item.sold ? <BadgeCheck className="h-4 w-4 text-gain" aria-label="A vendu" /> : null}
          {item.stars ? (
            <span className="num inline-flex items-center gap-0.5 text-xs font-semibold text-muted" aria-label={`Noté ${item.stars} sur 5`}>
              {item.stars}
              <Star className="h-3.5 w-3.5 fill-current text-cyan-ink" aria-hidden="true" />
            </span>
          ) : null}
          {item.saved ? <Star className="h-4 w-4 fill-current text-fg" aria-label="Favori" /> : null}
        </div>
      </Link>
    </li>
  );
}
