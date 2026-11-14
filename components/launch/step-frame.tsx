import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SubmitButton } from '@/components/ui/submit-button';
import { nextStepAction } from '@/app/app/lancer/actions';
import { LAUNCH_STEPS, launchHref, previousStep, stepIndex, STEP_TITLES, type LaunchStep } from '@/lib/v2/launch';

/**
 * Une étape tient sur un écran : un titre, une phrase, l'action principale, puis la navigation (revenir, étape
 * suivante). Rien d'autre.
 */
export function StepFrame({ step, sentence, children }: { step: LaunchStep; sentence: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby="etape-titre" className="animate-fade-up motion-reduce:animate-none">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        Étape {stepIndex(step) + 1} sur {LAUNCH_STEPS.length}
      </p>
      <h1 id="etape-titre" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
        {STEP_TITLES[step]}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{sentence}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/**
 * Pied d'étape : « Étape précédente » à gauche, « Étape suivante » à droite (valide l'étape). `blocked` explique ce
 * qui manque quand l'étape ne peut pas encore être validée.
 */
export function StepNav({ id, step, blocked, nextLabel = 'Étape suivante' }: { id: string; step: LaunchStep; blocked?: string | null; nextLabel?: string }) {
  const first = step === LAUNCH_STEPS[0];
  return (
    <div className="mt-10 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
      {first ? (
        <span />
      ) : (
        <Link
          href={launchHref(id, previousStep(step))}
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-fg/5 hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Étape précédente
        </Link>
      )}
      <form action={nextStepAction} className="flex flex-col items-stretch gap-2 sm:items-end">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="etape" value={step} />
        <SubmitButton size="lg" className="w-full sm:w-auto sm:min-w-[16rem]" disabled={Boolean(blocked)} pendingLabel="Validation…">
          {nextLabel}
        </SubmitButton>
        {blocked ? <p className="text-xs text-muted sm:text-right">{blocked}</p> : null}
      </form>
    </div>
  );
}
