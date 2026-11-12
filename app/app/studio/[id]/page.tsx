import type { Metadata } from 'next';
import { RefreshCw, Star } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LinkButton } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { formatLabel } from '@/lib/ai/formats';
import { scriptToText } from '@/lib/ai/scripts';
import { getRepo } from '@/lib/db';
import { MAX_HOOK_REGENERATIONS } from '@/lib/plans';
import { cn, formatRelative } from '@/lib/utils';
import { deleteScriptAction, regenerateHookAction, toggleSaveAction } from '../actions';

export const metadata: Metadata = { title: 'Tes scripts' };

export default async function ScriptPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { nouvelle?: string; erreur?: string };
}) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const repo = getRepo();
  const record = await repo.getScript(profile.id, params.id);
  if (!record) notFound();
  const product = await repo.getProduct(record.product_id);
  const regenLeft = Math.max(0, MAX_HOOK_REGENERATIONS - record.regen_count);
  const fresh = searchParams.nouvelle !== undefined ? Number(searchParams.nouvelle) : -1;

  return (
    <div>
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-muted">
        <Link href="/app/studio" className="hover:text-fg">
          Studio
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{formatLabel(record.format)}</span>
      </nav>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl">{product?.name ?? 'Produit retiré'}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            {formatLabel(record.format)} · écrit {formatRelative(record.created_at)}
            {record.source === 'simulation' ? <Badge tone="warn">Mode démo : scripts simulés</Badge> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={record.full_text} label="Copier tout" copiedLabel="Tout est copié" />
          <form action={toggleSaveAction}>
            <input type="hidden" name="script" value={record.id} />
            <input type="hidden" name="garder" value={record.saved ? '0' : '1'} />
            <SubmitButton variant={record.saved ? 'ink' : 'outline'} size="sm" pendingLabel={record.saved ? 'Retrait…' : 'Enregistrement…'}>
              <Star className={cn('h-4 w-4', record.saved && 'fill-current')} aria-hidden="true" />
              {record.saved ? 'Script gardé' : 'Garder ce script'}
            </SubmitButton>
          </form>
        </div>
      </header>

      {searchParams.erreur ? (
        <Callout tone="rose" className="mb-6" title="Accroche non régénérée">
          {searchParams.erreur}
        </Callout>
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
          {record.hooks.map((hook, index) => (
            <li
              key={`${index}-${hook.text}`}
              className={cn(
                'flex items-center gap-3 rounded-2xl border border-line px-3.5 py-3',
                index === fresh && 'animate-pop border-cyan-ink/50 bg-cyan-soft',
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
                  <input type="hidden" name="script" value={record.id} />
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
        {record.script.map((script, i) => (
          <Card key={i} className="sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-muted">
                  Script {i + 1} · <span className="num">{script.duration_seconds} s</span>
                </p>
                <h2 className="mt-0.5 text-xl">{script.title}</h2>
                <p className="mt-1 text-sm text-muted">{script.angle}</p>
              </div>
              <CopyButton text={scriptToText(script)} label="Copier ce script" copiedLabel="Script copié" />
            </div>

            <ol className="mt-5 space-y-4">
              {script.shots.map((shot, j) => (
                <li key={j} className="grid gap-2 sm:grid-cols-[4.5rem_1fr]">
                  <span className="num h-fit w-fit rounded-full bg-fg px-2.5 py-0.5 text-xs font-bold text-bg">{shot.time}</span>
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-sm text-muted">
                      <span className="font-semibold text-fg">On voit : </span>
                      {shot.visual}
                    </p>
                    <p className="text-[1.05rem] font-medium leading-relaxed">«&nbsp;{shot.voice}&nbsp;»</p>
                    {shot.on_screen_text ? (
                      <p className="text-sm">
                        <span className="text-muted">Texte à l’écran : </span>
                        <span className="rounded-md bg-surface px-1.5 py-0.5 font-semibold">{shot.on_screen_text}</span>
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>

            <Panel className="mt-5 space-y-2 text-sm">
              <p>
                <span className="font-semibold">Appel à l’action : </span>
                {script.call_to_action}
              </p>
              <p>
                <span className="font-semibold">Légende : </span>
                {script.caption} <span className="text-cyan-ink">{script.hashtags.join(' ')}</span>
              </p>
              <p className="border-t border-line pt-2 text-muted">{script.disclosure}</p>
            </Panel>
          </Card>
        ))}
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <LinkButton href={`/app/studio?produit=${record.product_id}`} variant="outline">
          Écrire d’autres scripts sur ce produit
        </LinkButton>
        <form action={deleteScriptAction}>
          <input type="hidden" name="script" value={record.id} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Suppression…" className="text-muted">
            Supprimer ce script
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
