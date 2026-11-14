import { Check, ExternalLink, Layers, Loader2, Lock, PenLine } from 'lucide-react';
import Link from 'next/link';
import { AutoRefresh } from '@/app/app/attente/[id]/auto-refresh';
import { keepScriptAction, launchAngleAction, launchGenerateAction, launchSeriesAction } from '@/app/app/lancer/actions';
import { FormatIcon } from '@/components/studio/format-icon';
import { LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, IconChip, Skeleton } from '@/components/ui/surface';
import { formatLabel, SCRIPT_FORMATS } from '@/lib/ai/formats';
import type { Profile } from '@/lib/db/types';
import { studioRights } from '@/lib/studio/limits';
import { cn, formatRelative } from '@/lib/utils';
import type { LaunchPageData } from '@/lib/v2/launch-view';
import { StepFrame, StepNav } from '../step-frame';

/**
 * Étape 3 : le studio dans l'étape. On écrit 10 accroches et 3 scripts sans quitter le lancement (la tâche revient ici),
 * puis on garde les scripts qu'on va tourner : le n-ième script gardé va à la vidéo n. Avec Pro, la série de 20 angles
 * donne un script différent par vidéo.
 */
export function ScriptsStep({
  data,
  profile,
  searchParams,
  generating,
}: {
  data: LaunchPageData;
  profile: Pick<Profile, 'plan'>;
  searchParams: Record<string, string | undefined>;
  /** Tâche d'écriture en cours (Netlify) : l'étape attend sur place. */
  generating: boolean;
}) {
  const { launch, docs, series } = data;
  const rights = studioRights(profile.plan);
  const kept = launch.data.kept;
  const keptIndex = (docId: string, script: number) => kept.findIndex((k) => k.doc_id === docId && k.script === script);
  return (
    <StepFrame step="scripts" sentence="Écris tes scripts ici, puis garde ceux que tu vas tourner : chacun ira à une vidéo, dans l’ordre.">
      {searchParams.erreur ? <Callout tone="rose" className="mb-6" title={searchParams.erreur} /> : null}
      {searchParams.ecrit ? <Callout tone="gain" className="mb-6" title="Scripts écrits : garde ceux que tu vas tourner." /> : null}

      {generating ? (
        <Card className="mb-6 sm:p-6" role="status" aria-live="polite">
          <div className="flex items-start gap-4">
            <IconChip size="lg" className="shrink-0">
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} />
            </IconChip>
            <div>
              <p className="text-lg font-semibold">On écrit tes scripts</p>
              <p className="mt-1 text-sm text-muted">10 accroches et 3 scripts : compte 20 à 40 secondes. Tu peux rester ici, ils s’affichent tout seuls.</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
          <AutoRefresh />
        </Card>
      ) : (
        <Card className="mb-8 sm:p-6">
          <form action={launchGenerateAction}>
            <div className="space-y-4">
              <input type="hidden" name="id" value={launch.id} />
              <fieldset className="min-w-0">
                <legend className="mb-3 text-sm font-semibold">Format de la vidéo</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-8">
                  {SCRIPT_FORMATS.map((f, i) => {
                    const open = rights.formats.includes(f.id);
                    return (
                      <label
                        key={f.id}
                        className={cn(
                          'relative flex cursor-pointer flex-col gap-2 rounded-xl border border-line bg-bg p-3 text-sm font-semibold transition-colors has-[:checked]:border-cyan-ink/60 has-[:checked]:bg-cyan-ink/[0.06] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan',
                          !open && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <input type="radio" name="format" value={f.id} defaultChecked={i === 0} disabled={!open} className="peer sr-only" />
                        <FormatIcon format={f.id} className="h-5 w-5 text-cyan-ink" />
                        <span className="leading-snug">{f.label}</span>
                        {!open ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                            <Lock className="h-3 w-3" aria-hidden="true" /> Pro
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel="Écriture…">
                <PenLine className="h-5 w-5" aria-hidden="true" />
                Écrire mes scripts
              </SubmitButton>
            </div>
          </form>
        </Card>
      )}

      {docs.length ? (
        <section aria-labelledby="scripts-ecrits">
          <h2 id="scripts-ecrits" className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-lg">
            Tes scripts
            <span className="text-sm font-medium text-muted">
              {kept.length ? `${kept.length} gardé${kept.length > 1 ? 's' : ''} pour tes vidéos` : 'Aucun gardé pour l’instant'}
            </span>
          </h2>
          <div className="space-y-6">
            {docs.slice(0, 6).map((doc) => (
              <div key={doc.id}>
                <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
                    <FormatIcon format={doc.format} className="h-3.5 w-3.5" />
                    {formatLabel(doc.format)}
                  </span>
                  <span>écrit {formatRelative(doc.generated_at)}</span>
                  <Link href={`/app/studio/${doc.id}`} className="inline-flex items-center gap-1 font-semibold hover:text-fg">
                    Ouvrir dans le studio <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </p>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {doc.scripts.map((script, i) => {
                    const at = keptIndex(doc.id, i);
                    return (
                      <li
                        key={i}
                        id={`script-${doc.id}-${i}`}
                        className={cn('flex scroll-mt-24 flex-col rounded-2xl border bg-raised p-4', at >= 0 ? 'border-cyan-ink/50' : 'border-line')}
                      >
                        <p className="font-semibold leading-snug">{script.title}</p>
                        <p className="num mt-0.5 text-xs text-muted">{script.duration_seconds} s</p>
                        <p className="mt-2 line-clamp-3 text-sm text-muted">{script.shots.map((s) => s.voice).join(' ')}</p>
                        <form action={keepScriptAction} className="mt-auto pt-3">
                          <input type="hidden" name="id" value={launch.id} />
                          <input type="hidden" name="doc" value={doc.id} />
                          <input type="hidden" name="script" value={i} />
                          <SubmitButton variant={at >= 0 ? 'secondary' : 'outline'} size="sm" className="w-full" pendingLabel="…">
                            {at >= 0 ? (
                              <>
                                <Check className="h-4 w-4" aria-hidden="true" />
                                Gardé · vidéo n°{at + 1}
                              </>
                            ) : (
                              'Garder pour une vidéo'
                            )}
                          </SubmitButton>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="serie-20" className="mt-10">
        <h2 id="serie-20" className="mb-1 flex items-center gap-2 text-lg">
          <Layers className="h-5 w-5 text-cyan-ink" aria-hidden="true" /> Série de 20 vidéos
        </h2>
        <p className="mb-4 text-sm text-muted">20 angles différents pour ce produit : un script par vidéo, sans répétition.</p>
        {rights.seriesPerDay <= 0 ? (
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">La série de 20 angles est incluse à partir du plan Pro.</p>
            <LinkButton href="/app/passer-pro" variant="outline" size="sm">
              Passer à Pro
            </LinkButton>
          </Card>
        ) : series ? (
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {series.data.angles.map((angle, i) => (
              <li key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-raised p-3">
                <p className="text-xs text-muted">
                  Angle {i + 1} · {formatLabel(angle.format)}
                </p>
                <p className="text-sm font-semibold leading-snug">{angle.title}</p>
                {angle.doc_id ? (
                  <p className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-gain">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> Scripts écrits
                  </p>
                ) : (
                  <form action={launchAngleAction} className="mt-auto">
                    <input type="hidden" name="id" value={launch.id} />
                    <input type="hidden" name="serie" value={series.id} />
                    <input type="hidden" name="angle" value={i} />
                    <SubmitButton variant="outline" size="sm" className="w-full" pendingLabel="Écriture…" disabled={generating}>
                      Écrire ce script
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <form action={launchSeriesAction}>
            <input type="hidden" name="id" value={launch.id} />
            <SubmitButton variant="outline" pendingLabel="Création…" disabled={generating}>
              <Layers className="h-4 w-4" aria-hidden="true" />
              Créer ma série de 20
            </SubmitButton>
          </form>
        )}
      </section>

      <StepNav id={launch.id} step="scripts" blocked={kept.length ? null : 'Garde au moins un script pour continuer.'} />
    </StepFrame>
  );
}
