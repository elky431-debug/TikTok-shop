import type { Metadata } from 'next';
import { Copy, FileDown, Fingerprint, Layers, PenLine, Sparkles, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ProductImage } from '@/components/product/product-image';
import { HookList } from '@/components/studio/hook-list';
import { ScriptTabs } from '@/components/studio/script-tabs';
import { CopyButton } from '@/components/ui/copy-button';
import { MoreMenu, menuItemClass } from '@/components/ui/menu';
import { Badge, Callout, SectionTitle } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { formatLabel } from '@/lib/ai/formats';
import { getRepo } from '@/lib/db';
import { fallbackImageUrl } from '@/lib/product-image';
import { shortLabel } from '@/lib/product-name';
import { studioRights } from '@/lib/studio';
import { editsLeft } from '@/lib/studio/edit';
import { docToText } from '@/lib/studio/export';
import { getDoc } from '@/lib/studio/store';
import { cn, formatEuros, formatPercent, formatRelative } from '@/lib/utils';
import { deleteScriptAction, regenerateHookAction, toggleSaveAction } from '../actions';
import { ScriptCard } from './script-card';

export const metadata: Metadata = { title: 'Tes scripts' };

export default async function ScriptPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { nouvelle?: string; erreur?: string; script?: string };
}) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const doc = await getDoc(profile.id, params.id);
  if (!doc) notFound();
  // Ancien lien (génération d'avant la session 5) : reprise faite, on suit la fiche.
  if (doc.id !== params.id) redirect(`/app/studio/${doc.id}`);

  const product = await getRepo().getProduct(doc.product_id);
  const rights = studioRights(profile.plan);
  const left = editsLeft(profile, doc);
  const regenLeft = Math.max(0, rights.hookRegenerations - doc.regen_count);
  const fresh = searchParams.nouvelle !== undefined ? Number(searchParams.nouvelle) : -1;
  const errorScript = searchParams.script !== undefined ? Number(searchParams.script) : -1;
  const globalError = searchParams.erreur && !(errorScript >= 0 && errorScript < doc.scripts.length) ? searchParams.erreur : null;
  const cardRights = {
    editsLeft: left,
    translation: rights.translation,
    export: rights.export,
  };
  const name = shortLabel(doc.product_name);
  const details = [formatLabel(doc.format), `${doc.settings.duration} s`, `écrit ${formatRelative(doc.generated_at)}`];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <nav aria-label="Fil d’Ariane" className="min-w-0 truncate text-sm text-muted">
          <Link href="/app/studio" className="hover:text-fg">
            Studio
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{formatLabel(doc.format)}</span>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <form action={toggleSaveAction}>
            <input type="hidden" name="script" value={doc.id} />
            <input type="hidden" name="garder" value={doc.saved ? '0' : '1'} />
            <button
              type="submit"
              aria-label={doc.saved ? 'Script gardé' : 'Garder ce script'}
              aria-pressed={doc.saved}
              title={doc.saved ? 'Retirer des favoris' : 'Garder ce script'}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
                doc.saved ? 'border-cyan-ink/40 bg-cyan-soft text-cyan-ink' : 'border-line text-muted hover:bg-surface hover:text-fg',
              )}
            >
              <Star className={cn('h-5 w-5', doc.saved && 'fill-current')} aria-hidden="true" />
            </button>
          </form>
          <MoreMenu>
            <CopyButton text={docToText(doc)} label="Copier tout" copiedLabel="Tout est copié" size="bare" className={menuItemClass} />
            {rights.export ? (
              <a href={`/app/studio/${doc.id}/export?format=pdf`} className={menuItemClass}>
                <FileDown aria-hidden="true" />
                Tout en PDF
              </a>
            ) : null}
            <Link href={`/app/studio?produit=${doc.product_id}`} className={menuItemClass}>
              <PenLine aria-hidden="true" />
              Autres scripts sur ce produit
            </Link>
            <form action={deleteScriptAction}>
              <input type="hidden" name="script" value={doc.id} />
              <button type="submit" className={cn(menuItemClass, 'text-rose-ink [&_svg]:text-rose-ink')}>
                <Trash2 aria-hidden="true" />
                Supprimer
              </button>
            </form>
          </MoreMenu>
        </div>
      </div>

      <header className="mb-10 flex items-start gap-4 sm:gap-5">
        <ProductImage
          src={product?.image_url ?? ''}
          fallback={fallbackImageUrl(doc.product_id, product?.niche ?? 'maison')}
          alt=""
          className="h-16 w-16 rounded-2xl sm:h-20 sm:w-20"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
          {product ? (
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="num text-lg font-bold">{formatEuros(product.price_cents)}</span>
              {product.commission_rate > 0 ? (
                <span className="num text-sm font-semibold text-cyan-ink">{formatPercent(product.commission_rate)} de commission</span>
              ) : null}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted">{details.join(' · ')}</p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 empty:hidden">
            {doc.source === 'simulation' ? <Badge tone="warn">Mode démo : scripts simulés</Badge> : null}
            {doc.simulated_edits > 0 && doc.source !== 'simulation' ? <Badge tone="warn">Retouches simulées</Badge> : null}
            {doc.personal_style ? (
              <Badge tone="cyan">
                <Fingerprint className="h-3 w-3" aria-hidden="true" />
                Style perso
              </Badge>
            ) : null}
            {doc.feedback_used > 0 ? (
              <Badge tone="cyan">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {doc.feedback_used} exemple{doc.feedback_used > 1 ? 's' : ''}
              </Badge>
            ) : null}
            {doc.series ? (
              <Link href={`/app/studio/serie/${doc.series.id}`}>
                <Badge tone="neutral" className="hover:bg-line">
                  <Layers className="h-3 w-3" aria-hidden="true" />
                  Série · {doc.series.index + 1}/20
                </Badge>
              </Link>
            ) : null}
          </p>
        </div>
      </header>

      {globalError ? (
        <Callout tone="rose" className="mb-6" title="Action non faite">
          {globalError}
        </Callout>
      ) : null}

      {/* Grand écran : accroches à gauche (elles restent visibles), scripts à droite. */}
      <div className="grid grid-cols-1 gap-12 xl:grid-cols-[minmax(22rem,2fr)_minmax(0,3fr)] xl:items-start xl:gap-10">
        <section id="accroches" aria-labelledby="titre-accroches" className="scroll-mt-20 xl:sticky xl:top-6">
          <SectionTitle
            id="titre-accroches"
            action={
              <span className="flex items-center gap-1.5 text-xs text-subtle">
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Un clic pour copier
              </span>
            }
          >
            10 accroches
          </SectionTitle>
          <HookList docId={doc.id} hooks={doc.hooks.map((h) => h.text)} fresh={fresh} canRegenerate={regenLeft > 0} regenerate={regenerateHookAction} />
        </section>

        <section className="min-w-0" aria-label="Scripts complets">
          <ScriptTabs
            labels={doc.scripts.map((_, i) => `Script ${i + 1}`)}
            badges={doc.scripts.map((s) => `${s.duration_seconds} s`)}
            panels={doc.scripts.map((_, i) => (
              <ScriptCard key={i} doc={doc} index={i} rights={cardRights} error={errorScript === i ? searchParams.erreur : undefined} />
            ))}
          />
        </section>
      </div>
    </div>
  );
}
