import type { Metadata } from 'next';
import { BadgeCheck, Download, Layers, PenLine, Star } from 'lucide-react';
import Link from 'next/link';
import { ProductImage } from '@/components/product/product-image';
import { FormatIcon } from '@/components/studio/format-icon';
import { StudioNav } from '@/components/studio/studio-nav';
import { Card, Callout, EmptyState, PageHeader, SectionTitle } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { formatLabel } from '@/lib/ai/formats';
import { getRepo } from '@/lib/db';
import { canAccessProduct } from '@/lib/radar';
import type { Product } from '@/lib/db/types';
import { cheapestPlanWith, getPlan, isUnlimited } from '@/lib/plans';
import { fallbackImageUrl } from '@/lib/product-image';
import { displayName, shortLabel } from '@/lib/product-name';
import { getUsageToday, latestSettings, listStudioProducts, studioRights } from '@/lib/studio';
import { collectFeedback } from '@/lib/studio/feedback';
import { listDocs, listHistory, type HistoryItem } from '@/lib/studio/store';
import { getStyle } from '@/lib/studio/style';
import { cn, formatEuros, formatPercent, formatRelative } from '@/lib/utils';
import { readStudioDraft } from '@/lib/v2/studio-draft';
import { StudioForm, type StudioProductOption } from './studio-form';

export const metadata: Metadata = { title: 'Studio de scripts' };

const FILTERS = [
  { id: 'tous', label: 'Tous', href: '/app/studio' },
  { id: 'gardes', label: 'Favoris', href: '/app/studio?gardes=1' },
  { id: 'vendu', label: 'Ont vendu', href: '/app/studio?vendu=1' },
] as const;

const PAGE = 30;

function toOption(p: Product): StudioProductOption {
  return {
    id: p.id,
    name: displayName(p),
    image: p.image_url,
    fallback: fallbackImageUrl(p.id, p.niche),
    price: formatEuros(p.price_cents),
    commission: p.commission_rate > 0 ? formatPercent(p.commission_rate) : null,
  };
}

export default async function StudioPage({
  searchParams,
}: {
  searchParams: {
    produit?: string;
    gardes?: string;
    vendu?: string;
    supprime?: string;
    plus?: string;
    brouillon?: string;
    erreur?: string;
  };
}) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const rights = studioRights(profile.plan);
  const repo = getRepo();
  const [products, usage, history, docs, style, settings, draft] = await Promise.all([
    listStudioProducts(profile),
    getUsageToday(profile),
    listHistory(profile.id),
    listDocs(profile.id),
    rights.personalStyle ? getStyle(profile.id) : Promise.resolve(null),
    latestSettings(profile),
    readStudioDraft(repo, profile.id, searchParams.brouillon),
  ]);
  const filter = searchParams.gardes === '1' ? 'gardes' : searchParams.vendu === '1' ? 'vendu' : 'tous';
  const filtered = history.filter((h) => (filter === 'gardes' ? h.saved : filter === 'vendu' ? h.sold : true));
  const shown = searchParams.plus === '1' ? filtered.slice(0, 300) : filtered.slice(0, PAGE);
  // Produit ouvert depuis la recherche (ni du jour, ni suivi) : proposé dans son propre groupe.
  const asked = searchParams.produit && ![...products.today, ...products.saved].some((p) => p.id === searchParams.produit) ? await repo.getProduct(searchParams.produit) : null;
  const searched = asked && (await canAccessProduct(profile, asked.id)) ? [asked] : [];
  const all = [...products.today, ...products.saved, ...searched];
  const selected = all.some((p) => p.id === searchParams.produit) ? searchParams.produit : undefined;
  const feedbackCount = collectFeedback(docs).best.length;
  // Vignettes de l'historique : produits déjà chargés, puis les autres en une requête.
  const known = new Map(all.map((p) => [p.id, p]));
  const missing = [...new Set(shown.map((h) => h.product_id))].filter((id) => !known.has(id));
  if (missing.length) for (const p of await repo.getProducts(missing)) known.set(p.id, p);

  return (
    <div>
      <PageHeader eyebrow="Créer" title="Studio de scripts" description="10 accroches et 3 scripts, prêts à tourner." />
      <StudioNav active="ecrire" />

      {searchParams.erreur ? (
        <Callout tone="rose" className="mb-4" title="Scripts non écrits">
          {searchParams.erreur.slice(0, 300)}
        </Callout>
      ) : null}
      {searchParams.supprime ? (
        <Callout tone="neutral" className="mb-4">
          Script supprimé.
        </Callout>
      ) : null}

      <Card className="sm:p-8">
        <StudioForm
          today={products.today.map(toOption)}
          saved={products.saved.map(toOption)}
          searched={searched.map(toOption)}
          selected={selected}
          remaining={usage.remaining}
          disabled={usage.remaining <= 0}
          settings={settings}
          style={!rights.personalStyle ? 'verrouille' : !style ? 'absent' : style.data.enabled ? 'actif' : 'inactif'}
          feedbackCount={feedbackCount}
          draft={
            draft
              ? {
                  id: draft.id,
                  title: draft.title,
                  lines: draft.lines,
                  format: draft.format,
                }
              : null
          }
          formats={rights.formats}
          formatsPlan={cheapestPlanWith((p) => p.scriptFormats > getPlan(profile.plan).scriptFormats).name}
          unlimited={isUnlimited(profile.plan, 'scriptsPerDay')}
        />
      </Card>

      <section className="mt-12" aria-labelledby="historique">
        <SectionTitle
          id="historique"
          action={
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
                <a
                  href="/app/studio/export"
                  className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-line hover:bg-surface"
                  aria-label="Exporter tout"
                  title="Exporter tout"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          }
        >
          Historique
        </SectionTitle>

        {shown.length === 0 ? (
          <EmptyState
            icon={
              filter === 'gardes' ? <Star className="h-5 w-5" /> : filter === 'vendu' ? <BadgeCheck className="h-5 w-5" /> : <PenLine className="h-5 w-5" />
            }
            title={filter === 'gardes' ? 'Aucun favori' : filter === 'vendu' ? 'Aucun script qui a vendu' : 'Pas encore de scripts'}
          >
            {filter === 'gardes' ? 'L’étoile d’un script le range ici.' : filter === 'vendu' ? 'Réponds « Il a vendu ? » sous un script.' : null}
          </EmptyState>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {shown.map((item) => (
              <HistoryRow key={item.id} item={item} product={known.get(item.product_id) ?? null} />
            ))}
          </ul>
        )}
        {filtered.length > shown.length ? (
          <p className="mt-4 text-center">
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

function HistoryRow({ item, product }: { item: HistoryItem; product: Product | null }) {
  return (
    <li>
      <Link
        href={`/app/studio/${item.id}`}
        className="group flex items-center gap-3 rounded-2xl border border-line bg-raised p-2.5 pr-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong"
      >
        <ProductImage
          src={product?.image_url ?? ''}
          fallback={fallbackImageUrl(item.product_id, product?.niche ?? 'maison')}
          alt=""
          className="h-12 w-12 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{shortLabel(item.product_name)}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted">
            <FormatIcon format={item.format} className="h-3.5 w-3.5 shrink-0" />
            {formatLabel(item.format)} · {formatRelative(item.generated_at)}
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
