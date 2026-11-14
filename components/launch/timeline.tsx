import { Check } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LAUNCH_STEPS, launchHref, STEP_LABELS, type LaunchStep } from '@/lib/v2/launch';

/**
 * Frise du lancement : étapes faites cochées, étape affichée mise en avant (trait dégradé), chaque étape s'ouvre d'un
 * clic (revenir en arrière ou regarder plus loin). Sur téléphone, seuls les numéros et l'étape affichée ont leur nom.
 */
export function LaunchTimeline({ id, done, viewing }: { id: string | null; done: LaunchStep[]; viewing: LaunchStep }) {
  return (
    <nav aria-label="Étapes du lancement" className="mb-8">
      <ol className="grid grid-cols-7 gap-1 sm:gap-2">
        {LAUNCH_STEPS.map((step, i) => {
          const isDone = done.includes(step);
          const isViewing = step === viewing;
          return (
            <li key={step} className="min-w-0">
              <StepLink id={id} step={step} current={isViewing}>
                <span className="flex w-full items-center gap-1">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors',
                      isDone ? 'border-transparent bg-[image:var(--gradient)] text-on-gradient' : 'border-line-strong bg-bg text-muted',
                      isViewing && 'ring-2 ring-cyan-ink ring-offset-2 ring-offset-bg',
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : i + 1}
                  </span>
                  {i < LAUNCH_STEPS.length - 1 ? (
                    <span className={cn('h-0.5 flex-1 rounded-full', isDone ? 'bg-[image:var(--gradient)]' : 'bg-line')} aria-hidden="true" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    'truncate text-xs font-semibold',
                    // Sur téléphone, seul le nom de l'étape affichée se voit ; les autres restent lus par les lecteurs d'écran.
                    isViewing ? 'text-fg' : 'sr-only text-muted group-hover:text-fg sm:not-sr-only sm:block',
                  )}
                >
                  {STEP_LABELS[step]}
                  <span className="sr-only">{isDone ? ' (faite)' : ' (à faire)'}</span>
                </span>
              </StepLink>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Lien vers une étape ; sans lancement encore (choix du produit), simple repère. */
function StepLink({ id, step, current, children }: { id: string | null; step: LaunchStep; current: boolean; children: ReactNode }) {
  const className = 'group flex flex-col items-start gap-2 rounded-xl p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan';
  if (!id) {
    return (
      <span aria-current={current ? 'step' : undefined} className={className}>
        {children}
      </span>
    );
  }
  return (
    <Link href={launchHref(id, step)} aria-current={current ? 'step' : undefined} className={className}>
      {children}
    </Link>
  );
}
