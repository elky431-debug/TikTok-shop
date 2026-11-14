import { Check } from 'lucide-react';
import Link from 'next/link';
import { filmedAction } from '@/app/app/lancer/actions';
import { Teleprompter } from '@/components/studio/teleprompter';
import { prompterLines } from '@/components/studio/teleprompter-model';
import { ProgressBar } from '@/components/ui/surface';
import { cn, formatLongDate } from '@/lib/utils';
import { launchHref } from '@/lib/v2/launch';
import type { LaunchPageData } from '@/lib/v2/launch-view';
import { StepFrame, StepNav } from '../step-frame';

/**
 * Étape 5 : les vidéos à tourner, chacune avec son script (le n-ième script gardé), le téléprompteur et une case
 * « Tournée ». La première vidéo tournée passe le produit à « En tournage ».
 */
export function ShootStep({ data }: { data: LaunchPageData }) {
  const { launch, board, docs } = data;
  const items = board?.data.items ?? [];
  const open = items.filter((i) => i.status !== 'poste');
  const filmed = items.filter((i) => i.status === 'tourne').length;
  const posted = items.length - open.length;
  const scriptFor = (n: number) => {
    const kept = launch.data.kept[n - 1];
    if (!kept) return null;
    const doc = docs.find((d) => d.id === kept.doc_id);
    return doc?.scripts[kept.script] ?? null;
  };

  // Un écran : les vidéos qui ont un script (ou déjà tournées), plus la prochaine sans script ; le reste en une ligne.
  const ready = open.filter((i) => i.status === 'tourne' || scriptFor(i.n));
  const nextWithout = open.find((i) => i.status === 'a_tourner' && !scriptFor(i.n));
  const shown = [...ready, ...(nextWithout ? [nextWithout] : [])].sort((a, b) => a.n - b.n);
  const hidden = open.length - shown.length;

  return (
    <StepFrame step="tourner" sentence="Tourne tes vidéos une par une avec le téléprompteur, puis coche « Tournée ».">
      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <ProgressBar value={filmed + posted} max={Math.max(1, items.length)} label="Vidéos tournées" />
        <p className="num text-sm text-muted">
          {filmed + posted} tournée{filmed + posted > 1 ? 's' : ''} sur {items.length}
        </p>
      </div>
      {shown.length ? (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {shown.map((item) => {
            const script = scriptFor(item.n);
            const done = item.status === 'tourne';
            return (
              <li
                key={item.n}
                id={`video-${item.n}`}
                className={cn('scroll-mt-24 rounded-2xl border bg-raised p-4', done ? 'border-gain/40' : 'border-line')}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">Vidéo n°{item.n}</p>
                    <p className="text-xs text-muted">{item.date ? `Prévue le ${formatLongDate(item.date)}` : 'Pas encore dans le calendrier'}</p>
                  </div>
                  <form action={filmedAction}>
                    <input type="hidden" name="id" value={launch.id} />
                    <input type="hidden" name="n" value={item.n} />
                    <button
                      type="submit"
                      aria-pressed={done}
                      aria-label={`Vidéo n°${item.n} tournée`}
                      className={cn(
                        'inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors',
                        done ? 'border-gain/40 bg-gain-soft text-gain' : 'border-line-strong text-fg hover:bg-surface',
                      )}
                    >
                      <span
                        className={cn('flex h-5 w-5 items-center justify-center rounded-md border-2', done ? 'border-gain bg-gain text-white' : 'border-line-strong')}
                        aria-hidden="true"
                      >
                        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                      </span>
                      Tournée
                    </button>
                  </form>
                </div>
                {script ? (
                  <div className="mt-3">
                    <p className="text-sm font-semibold">{script.title}</p>
                    <details className="mt-1 text-sm">
                      <summary className="cursor-pointer text-muted hover:text-fg">Voir le script</summary>
                      <ol className="mt-2 space-y-1.5">
                        {script.shots.map((shot, i) => (
                          <li key={i} className="leading-relaxed">
                            {shot.voice}
                          </li>
                        ))}
                      </ol>
                    </details>
                    <div className="mt-3">
                      <Teleprompter title={script.title} lines={prompterLines(script.shots)} variant="outline" />
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    Pas encore de script pour cette vidéo :{' '}
                    <Link href={launchHref(launch.id, 'scripts')} className="font-semibold text-fg underline underline-offset-2">
                      garde-en un à l’étape Scripts
                    </Link>
                    .
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-line bg-raised p-4 text-sm text-muted">Toutes tes vidéos sont en ligne.</p>
      )}
      {hidden > 0 ? (
        <p className="mt-4 text-sm text-muted">
          Encore {hidden} vidéo{hidden > 1 ? 's' : ''} sans script :{' '}
          <Link href={launchHref(launch.id, 'scripts')} className="font-semibold text-fg underline underline-offset-2">
            garde d’autres scripts
          </Link>{' '}
          pour les voir ici.
        </p>
      ) : null}
      <StepNav id={launch.id} step="tourner" blocked={filmed + posted ? null : 'Coche au moins une vidéo tournée pour continuer.'} />
    </StepFrame>
  );
}
