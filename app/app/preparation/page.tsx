import type { Metadata } from 'next';
import { Sprout } from 'lucide-react';
import { FollowerChart } from '@/components/v2/follower-chart';
import { LinkButton } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { ChoiceChip, Field, Input, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, PageHeader, Panel, ProgressBar } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getLiveCatalog } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import { ensureCatalog } from '@/lib/jobs/nightly';
import { NICHES, nicheLabel } from '@/lib/niches';
import { AFFILIATE_THRESHOLD } from '@/lib/profile-rules';
import { regionFor } from '@/lib/regions';
import { cn, formatInt, formatLongDate, formatShortDate, parisDate } from '@/lib/utils';
import {
  CHECKLIST,
  checklistProgress,
  CONTENT_PLAN_KIND,
  CONTENT_TYPE_LABELS,
  contentPlansPerDay,
  getPreparation,
  nicheStats,
  recommendNiches,
  type ContentPlanData,
} from '@/lib/v2/preparation';
import { remainingToday } from '@/lib/v2/quota';
import { chooseNicheAction, declareThresholdAction, generatePlanAction, logFollowersAction, saveChecklistAction, saveTastesAction } from './actions';

export const metadata: Metadata = { title: 'Mode préparation' };

const MESSAGES: Record<string, { tone: 'gain' | 'rose' | 'neutral'; text: string }> = {
  'ok:abonnes': { tone: 'gain', text: 'Abonnés enregistrés.' },
  'ok:gouts': { tone: 'gain', text: 'Goûts enregistrés : le classement des niches en tient compte.' },
  'ok:niche': { tone: 'gain', text: 'Niche choisie. Crée maintenant ton plan de 30 jours.' },
  'ok:plan': { tone: 'gain', text: 'Ton plan de 30 jours est prêt.' },
  'ok:liste': { tone: 'gain', text: 'Liste de vérification enregistrée.' },
  'ok:deja': { tone: 'neutral', text: 'Ton compte est déjà en mode affilié.' },
  'erreur:abonnes': { tone: 'rose', text: 'Indique un nombre d’abonnés (exemple : 840) et une date qui n’est pas dans le futur.' },
  'erreur:niche': { tone: 'rose', text: 'Choisis d’abord une niche.' },
  'erreur:quota': { tone: 'rose', text: 'Tu as déjà créé tes plans du jour. Reviens demain pour en créer un autre.' },
  'erreur:ia': { tone: 'rose', text: 'Le plan n’a pas pu être écrit. Réessaie dans un instant.' },
};

export default async function PreparationPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/preparation');
  await ensureCatalog();
  const repo = getRepo();
  const today = parisDate();
  const [prep, catalog, plans, left] = await Promise.all([
    getPreparation(repo, profile.id),
    getLiveCatalog(repo, new Date(), regionFor(profile)),
    repo.listRecords<ContentPlanData>(profile.id, CONTENT_PLAN_KIND),
    remainingToday(profile.id, CONTENT_PLAN_KIND, contentPlansPerDay(profile)),
  ]);
  const { data } = prep;
  const advice = recommendNiches(nicheStats(catalog.products), data.tastes.niches);
  const latestPlan = plans.find((p) => p.data.niche === data.niche) ?? null;
  const latestCount = data.followers.at(-1) ?? null;
  const checklist = checklistProgress(data.checklist);
  const affiliate = profile.eligibility === 'affilie';
  const notice = searchParams.ok ? MESSAGES[`ok:${searchParams.ok}`] : searchParams.erreur ? MESSAGES[`erreur:${searchParams.erreur}`] : null;
  const planText = latestPlan
    ? [latestPlan.data.plan.intro, ...latestPlan.data.plan.days.map((d) => `Jour ${d.day} · ${CONTENT_TYPE_LABELS[d.type]} : ${d.title}\n${d.idea}\nAccroche : « ${d.hook} »`)].join('\n\n')
    : '';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Compte"
        title="Mode préparation"
        description={`Sous ${formatInt(AFFILIATE_THRESHOLD)} abonnés, on prépare ton compte : une niche, 30 jours de vidéos sans vente, et tout ce qu’il faut pour être prêt le jour où tu passes le cap.`}
      />

      {searchParams.ok === 'affilie' ? (
        <Callout
          tone="gain"
          className="mb-6"
          icon={<Sprout className="h-5 w-5 text-gain" aria-hidden="true" />}
          title="Bravo, tu passes en mode affilié"
          action={<LinkButton href="/app/radar">Ouvrir le radar</LinkButton>}
        >
          Ton compte affiche maintenant le radar comme un affilié. Avant de vendre, active l’affiliation dans l’appli TikTok et
          vérifie les conditions de la liste ci-dessous.
        </Callout>
      ) : affiliate ? (
        <Callout tone="cyan" className="mb-6" title="Ton compte est en mode affilié" action={<LinkButton href="/app/radar" variant="outline" size="sm">Ouvrir le radar</LinkButton>}>
          Ton suivi d’abonnés et ta liste de vérification restent ici.
        </Callout>
      ) : null}
      {notice ? <Callout tone={notice.tone} className="mb-6" title={notice.text} /> : null}

      <Card id="progression">
        <h2 className="text-lg">Tes abonnés</h2>
        <div className="mt-3 flex items-baseline justify-between text-sm">
          <span className="font-semibold">
            <span className="num">{latestCount ? formatInt(latestCount.count) : '—'}</span> / <span className="num">{formatInt(AFFILIATE_THRESHOLD)}</span> abonnés
          </span>
          <span className="text-muted">{latestCount ? `noté le ${formatShortDate(latestCount.date)}` : 'pas encore noté'}</span>
        </div>
        <ProgressBar className="mt-2" value={latestCount?.count ?? 0} max={AFFILIATE_THRESHOLD} label={`Abonnés sur le seuil de ${formatInt(AFFILIATE_THRESHOLD)}`} />
        <FollowerChart entries={data.followers} threshold={AFFILIATE_THRESHOLD} />
        {data.followers.length === 1 ? <p className="mt-3 text-sm text-muted">Note ton nombre d’abonnés une fois par semaine : la courbe apparaît dès le deuxième point.</p> : null}
        <form action={logFollowersAction} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Abonnés" htmlFor="abonnes">
            <Input id="abonnes" name="abonnes" type="number" min={0} inputMode="numeric" required placeholder="840" className="num" />
          </Field>
          <Field label="Date" htmlFor="date-abonnes">
            <Input id="date-abonnes" name="date" type="date" max={today} defaultValue={today} />
          </Field>
          <SubmitButton className="col-span-2 sm:col-span-1" pendingLabel="Enregistrement…">
            Enregistrer mes abonnés
          </SubmitButton>
        </form>
        <p className="mt-2 text-xs text-muted">Tu lis ce chiffre sur ton profil TikTok : rien n’est relevé sur ton compte. À {formatInt(AFFILIATE_THRESHOLD)}, ton compte passe tout seul en mode affilié.</p>
        {!affiliate ? (
          <form action={declareThresholdAction} className="mt-3">
            <SubmitButton variant="outline" size="sm" pendingLabel="Passage…">
              J’ai atteint {formatInt(AFFILIATE_THRESHOLD)} abonnés
            </SubmitButton>
          </form>
        ) : null}
      </Card>

      <Card id="niche" className="mt-6">
        <h2 className="text-lg">Choisis ta niche</h2>
        <p className="mt-1 text-sm text-muted">Le classement croise les niches qui montent dans le radar du jour et ce que tu aimes filmer.</p>
        {catalog.demo ? (
          <p className="mt-2 text-xs font-semibold text-warn">Produits fictifs de démonstration : ce classement n’est qu’un exemple.</p>
        ) : catalog.stale && catalog.dataDate ? (
          <p className="mt-2 text-xs text-muted">Données du {formatLongDate(catalog.dataDate)}.</p>
        ) : null}
        <form action={saveTastesAction} className="mt-4 space-y-3">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Les niches que tu aimes</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {NICHES.map((n) => (
                <ChoiceChip key={n.id} name="niches" value={n.id} defaultChecked={data.tastes.niches.includes(n.id)}>
                  {n.label}
                </ChoiceChip>
              ))}
            </div>
          </fieldset>
          <Field label="Ce que tu aimes filmer (facultatif)" htmlFor="envies" hint="Exemple : ma routine du matin, la cuisine rapide, mon chien.">
            <Textarea id="envies" name="envies" rows={2} maxLength={400} defaultValue={data.tastes.about ?? ''} />
          </Field>
          <SubmitButton variant="outline" size="sm" pendingLabel="Enregistrement…">
            Enregistrer mes goûts
          </SubmitButton>
        </form>

        <ol className="mt-5 space-y-2">
          {advice.map((a, i) => (
            <li key={a.niche} className={cn('rounded-2xl border p-4', data.niche === a.niche ? 'border-cyan-ink/50 bg-cyan-ink/[0.05]' : 'border-line')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  <span className="num mr-2 text-muted">{i + 1}.</span>
                  {nicheLabel(a.niche)}
                  {a.liked ? <Badge tone="cyan" className="ml-2">Tu aimes</Badge> : null}
                </p>
                <span className="num text-sm font-semibold">{a.score}/100</span>
              </div>
              <ul className="mt-2 space-y-0.5 text-sm text-muted">
                {a.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {data.niche === a.niche ? (
                <p className="mt-3 text-sm font-semibold text-cyan-ink">Ta niche</p>
              ) : (
                <form action={chooseNicheAction} className="mt-3">
                  <input type="hidden" name="niche" value={a.niche} />
                  <SubmitButton variant={i === 0 && !data.niche ? 'primary' : 'outline'} size="sm" pendingLabel="Choix…">
                    Choisir {nicheLabel(a.niche).toLowerCase()}
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Card id="plan" className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg">Ton plan de 30 jours</h2>
            <p className="mt-1 text-sm text-muted">Une vidéo par jour, aucune vente : le but est que les gens reviennent pour toi.</p>
          </div>
          {latestPlan?.data.simulated ? <Badge>Plan simulé</Badge> : null}
        </div>
        {data.niche ? (
          <>
            <form action={generatePlanAction} className="mt-4 flex flex-wrap items-center gap-3">
              <SubmitButton pendingLabel="Écriture du plan…" disabled={left <= 0}>
                {latestPlan ? 'Écrire un nouveau plan' : `Écrire mon plan ${nicheLabel(data.niche).toLowerCase()}`}
              </SubmitButton>
              <span className="text-xs text-muted">
                {left} plan{left > 1 ? 's' : ''} possible{left > 1 ? 's' : ''} aujourd’hui.
              </span>
            </form>
            {latestPlan ? (
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">{latestPlan.data.plan.intro}</p>
                  <CopyButton text={planText} label="Copier le plan" copiedLabel="Plan copié" />
                </div>
                <div className="mt-4 space-y-2">
                  {[0, 1, 2, 3, 4].map((week) => {
                    const days = latestPlan.data.plan.days.slice(week * 7, week * 7 + 7);
                    if (!days.length) return null;
                    return (
                      <details key={week} open={week === 0} className="rounded-2xl border border-line">
                        <summary className="cursor-pointer px-4 py-3 font-semibold">
                          {week < 4 ? `Semaine ${week + 1}` : 'Derniers jours'} <span className="num text-sm font-normal text-muted">· jours {days[0].day} à {days.at(-1)!.day}</span>
                        </summary>
                        <ol className="divide-y divide-line border-t border-line">
                          {days.map((d) => (
                            <li key={d.day} className="px-4 py-3 text-sm">
                              <p className="flex flex-wrap items-baseline gap-x-2">
                                <span className="num font-bold text-muted">J{d.day}</span>
                                <span className="font-semibold">{d.title}</span>
                                <span className="text-xs text-cyan-ink">{CONTENT_TYPE_LABELS[d.type]}</span>
                              </p>
                              <p className="mt-1 text-fg/85">{d.idea}</p>
                              <p className="mt-1 text-muted">Accroche : « {d.hook} »</p>
                            </li>
                          ))}
                        </ol>
                      </details>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">Choisis d’abord ta niche juste au-dessus.</p>
        )}
      </Card>

      <Card id="verification" className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg">Prêt pour l’affiliation ?</h2>
          <span className="num text-sm text-muted">
            {checklist.done} / {checklist.total}
          </span>
        </div>
        <ProgressBar className="mt-3" value={checklist.done} max={checklist.total} label="Points de la liste de vérification cochés" />
        <form action={saveChecklistAction} className="mt-4 space-y-4">
          {(['condition', 'conseil'] as const).map((kind) => (
            <fieldset key={kind}>
              <legend className="mb-2 text-sm font-semibold">{kind === 'condition' ? 'Conditions de TikTok' : 'Pour être prêt le jour J'}</legend>
              <div className="space-y-2">
                {CHECKLIST.filter((i) => i.kind === kind).map((item) => (
                  <ChoiceChip key={item.id} name="fait" value={item.id} defaultChecked={Boolean(data.checklist[item.id])} description={item.hint}>
                    {item.label}
                  </ChoiceChip>
                ))}
              </div>
            </fieldset>
          ))}
          <SubmitButton variant="outline" size="sm" pendingLabel="Enregistrement…">
            Enregistrer ma liste
          </SubmitButton>
        </form>
        <Panel className="mt-4 text-xs text-muted">Conditions à confirmer dans l’appli TikTok (centre des créateurs) : elles peuvent changer.</Panel>
      </Card>
    </div>
  );
}
