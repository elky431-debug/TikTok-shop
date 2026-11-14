import { BellRing, CalendarDays } from 'lucide-react';
import { planLaunchAction } from '@/app/app/lancer/actions';
import { LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card } from '@/components/ui/surface';
import type { Profile } from '@/lib/db/types';
import { getPlan } from '@/lib/plans';
import { rhythmFor } from '@/lib/profile-rules';
import { addDays, parisDate } from '@/lib/utils';
import type { LaunchPageData } from '@/lib/v2/launch-view';
import { RHYTHM_HINTS, RHYTHMS, weekdayOf } from '@/lib/v2/planning';
import { PlanCalendar, type CalendarVideo } from '../plan-calendar';
import { StepFrame, StepNav } from '../step-frame';

/** Semaines (lundi → dimanche) qui couvrent aujourd'hui et toutes les dates du plan, 12 au plus. */
export function calendarWeeks(dates: string[], today: string): string[][] {
  const sorted = [today, ...dates].sort();
  const first = addDays(sorted[0], -weekdayOf(sorted[0]));
  const last = sorted.at(-1)!;
  const weeks: string[][] = [];
  for (let monday = first; monday <= last && weeks.length < 12; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  }
  return weeks;
}

/**
 * Étape 4 : les vidéos à tourner sont réparties dans le calendrier, au rythme choisi à l'onboarding (modifiable). On
 * les déplace ensuite par glisser-déposer. Les rappels du jour J partent tout seuls à l'heure du récap.
 */
export function PlanStep({ data, profile, searchParams }: { data: LaunchPageData; profile: Profile; searchParams: Record<string, string | undefined> }) {
  const { launch, board } = data;
  const plan = getPlan(profile.plan);
  const today = parisDate();
  const scheduled = Boolean(board?.data.rhythm);
  const defaultRhythm = board?.data.rhythm ?? rhythmFor(profile.videos_per_week);
  const videos: CalendarVideo[] = (board?.data.items ?? []).map((item) => ({
    n: item.n,
    date: item.date,
    status: item.status,
    script: launch.data.kept[item.n - 1]?.title ?? null,
  }));
  const dates = videos.map((v) => v.date).filter((d): d is string => Boolean(d));

  const form = (
    <form action={planLaunchAction}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
        <input type="hidden" name="id" value={launch.id} />
        <label className="text-sm font-semibold">
          Rythme
          <select
            name="rythme"
            defaultValue={String(defaultRhythm)}
            className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm font-normal text-fg"
          >
            {RHYTHMS.map((r) => (
              <option key={r} value={r}>
                {r} vidéos par semaine ({RHYTHM_HINTS[r]})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          À partir du
          <input
            type="date"
            name="debut"
            min={today}
            defaultValue={board?.data.start && board.data.start >= today ? board.data.start : addDays(today, 1)}
            className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm font-normal text-fg"
          />
        </label>
        <SubmitButton size="lg" pendingLabel="Répartition…">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
          {scheduled ? 'Répartir à nouveau' : 'Planifier mes vidéos'}
        </SubmitButton>
      </div>
    </form>
  );

  return (
    <StepFrame
      step="planifier"
      sentence={`Tes vidéos à tourner, réparties dans ton calendrier : ${defaultRhythm} par semaine, comme tu l’as choisi. Déplace-les comme tu veux.`}
    >
      {!plan.planning ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Le calendrier de publication est inclus dans tous les abonnements.</p>
          <LinkButton href="/abonnement" variant="outline" size="sm">
            Choisir mon abonnement
          </LinkButton>
        </Card>
      ) : (
        <>
          {searchParams.ok === 'planifie' ? <Callout tone="gain" className="mb-6" title="Vidéos réparties dans ton calendrier." /> : null}
          {searchParams.erreur === 'limite' ? <Callout tone="warn" className="mb-6" title="Ce produit n’est plus suivi : la limite de ton plan est atteinte." /> : null}
          {scheduled ? (
            <>
              <Card className="sm:p-6">
                <PlanCalendar launchId={launch.id} videos={videos} weeks={calendarWeeks(dates, today)} today={today} />
              </Card>
              <p className="mt-4 flex items-start gap-2 text-sm text-muted">
                <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-cyan-ink" aria-hidden="true" />
                Rappel activé : le jour J, à {profile.digest_hour} h, tu reçois la vidéo à tourner (notification, e-mail ou Discord selon tes
                réglages).
              </p>
              <details className="group mt-6 rounded-2xl border border-line">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  Changer le rythme ou la date de départ
                </summary>
                <div className="border-t border-line p-4">{form}</div>
              </details>
            </>
          ) : (
            <Card className="sm:p-6">{form}</Card>
          )}
        </>
      )}
      <StepNav id={launch.id} step="planifier" blocked={scheduled ? null : 'Planifie tes vidéos pour continuer.'} />
    </StepFrame>
  );
}
