import type { Metadata } from 'next';
import { FileDown, Fingerprint, Layers, RefreshCw, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LinkButton } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { formatLabel } from '@/lib/ai/formats';
import { studioRights } from '@/lib/studio';
import { editsLeft } from '@/lib/studio/edit';
import { docToText, settingsLine } from '@/lib/studio/export';
import { getDoc } from '@/lib/studio/store';
import { cn, formatRelative } from '@/lib/utils';
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

  const rights = studioRights(profile.plan);
  const left = editsLeft(profile, doc);
  const regenLeft = Math.max(0, rights.hookRegenerations - doc.regen_count);
  const fresh = searchParams.nouvelle !== undefined ? Number(searchParams.nouvelle) : -1;
  const errorScript = searchParams.script !== undefined ? Number(searchParams.script) : -1;
  const globalError = searchParams.erreur && !(errorScript >= 0 && errorScript < doc.scripts.length) ? searchParams.erreur : null;
  const cardRights = { editsLeft: left, translation: rights.translation, export: rights.export };

  return (
    <div>
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-muted">
        <Link href="/app/studio" className="hover:text-fg">
          Studio
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{formatLabel(doc.format)}</span>
      </nav>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl">{doc.product_name}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {settingsLine(doc)} · écrit {formatRelative(doc.generated_at)}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            {doc.source === 'simulation' ? <Badge tone="warn">Mode démo : scripts simulés</Badge> : null}
            {doc.simulated_edits > 0 && doc.source !== 'simulation' ? <Badge tone="warn">Retouches simulées (sans clé d’IA)</Badge> : null}
            {doc.personal_style ? (
              <Badge tone="cyan">
                <Fingerprint className="h-3 w-3" aria-hidden="true" />
                Style perso
              </Badge>
            ) : null}
            {doc.feedback_used > 0 ? (
              <Badge tone="cyan">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {doc.feedback_used} exemple{doc.feedback_used > 1 ? 's' : ''} de tes notes
              </Badge>
            ) : null}
            {doc.series ? (
              <Link href={`/app/studio/serie/${doc.series.id}`}>
                <Badge tone="neutral" className="hover:bg-line">
                  <Layers className="h-3 w-3" aria-hidden="true" />
                  Série · vidéo {doc.series.index + 1}/20
                </Badge>
              </Link>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={docToText(doc)} label="Copier tout" copiedLabel="Tout est copié" />
          {rights.export ? (
            <a
              href={`/app/studio/${doc.id}/export?format=pdf`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-semibold hover:bg-surface"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Tout en PDF
            </a>
          ) : null}
          <form action={toggleSaveAction}>
            <input type="hidden" name="script" value={doc.id} />
            <input type="hidden" name="garder" value={doc.saved ? '0' : '1'} />
            <SubmitButton variant={doc.saved ? 'ink' : 'outline'} size="sm" pendingLabel={doc.saved ? 'Retrait…' : 'Enregistrement…'}>
              <Star className={cn('h-4 w-4', doc.saved && 'fill-current')} aria-hidden="true" />
              {doc.saved ? 'Script gardé' : 'Garder ce script'}
            </SubmitButton>
          </form>
        </div>
      </header>

      {globalError ? (
        <Callout tone="rose" className="mb-6" title="Action non faite">
          {globalError}
        </Callout>
      ) : null}
      {!rights.export ? (
        <p className="mb-6 text-sm text-muted">
          Copie tes scripts avec les boutons « Copier ». L’export en PDF et en texte est inclus dans{' '}
          <Link href="/app/passer-pro" className="font-semibold text-fg underline underline-offset-2">
            le plan Pro+
          </Link>
          .
        </p>
      ) : null}

      <section id="accroches" aria-labelledby="titre-accroches" className="scroll-mt-20">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="titre-accroches" className="text-xl">
            10 accroches
          </h2>
          <p className="text-sm text-muted">
            Moins de 3 secondes chacune ·{' '}
            {regenLeft > 0 ? `tu peux encore en remplacer ${regenLeft}` : 'plus de remplacement possible sur ce script'}
          </p>
        </div>
        <ol className="grid gap-2 md:grid-cols-2">
          {doc.hooks.map((hook, index) => (
            <li
              key={`${index}-${hook.text}`}
              className={cn(
                'flex items-center gap-3 rounded-2xl border border-line bg-raised px-3.5 py-3',
                index === fresh && 'animate-pop border-cyan-ink/50 bg-cyan-soft motion-reduce:animate-none',
              )}
            >
              <span className="num w-5 shrink-0 text-sm font-bold text-muted">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{hook.text}</p>
                <p className="num mt-0.5 text-xs text-muted">{String(hook.seconds).replace('.', ',')} s à l’oral</p>
              </div>
              <CopyButton text={hook.text} size="icon" label="Copier l’accroche" copiedLabel="Accroche copiée" />
              {regenLeft > 0 ? (
                <form action={regenerateHookAction}>
                  <input type="hidden" name="script" value={doc.id} />
                  <input type="hidden" name="index" value={index} />
                  <button
                    type="submit"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-fg"
                    aria-label={`Nouvelle accroche à la place de la n°${index + 1}`}
                    title="Nouvelle accroche"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 space-y-6" aria-label="Scripts complets">
        {doc.scripts.map((_, i) => (
          <ScriptCard key={i} doc={doc} index={i} rights={cardRights} error={errorScript === i ? searchParams.erreur : undefined} />
        ))}
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <LinkButton href={`/app/studio?produit=${doc.product_id}`} variant="outline">
          Écrire d’autres scripts sur ce produit
        </LinkButton>
        <form action={deleteScriptAction}>
          <input type="hidden" name="script" value={doc.id} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Suppression…" className="text-muted">
            Supprimer ce script
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
