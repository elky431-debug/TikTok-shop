import type { Metadata } from 'next';
import { AlertTriangle, BellRing } from 'lucide-react';
import Link from 'next/link';
import { PlanGate } from '@/components/app/plan-gate';
import { CopyButton } from '@/components/ui/copy-button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, PageHeader, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { addDays, cn, formatLongDate, formatShortDate, parisDate } from '@/lib/utils';
import { OFFER_STATUS_LABELS, offerWarnings, type OfferData, type OfferStatus } from '@/lib/v2/offers';
import { remainingToday } from '@/lib/v2/quota';
import { analyzeOfferAction, deleteOfferAction, setOfferStatusAction } from './actions';

export const metadata: Metadata = { title: 'Propositions de marques' };

const ERRORS: Record<string, string> = {
  court: 'Colle le message complet de la marque (30 caractères au moins).',
  quota: 'Tu as atteint le nombre d’analyses du jour. Reviens demain.',
  ia: 'L’analyse n’a pas pu être faite. Réessaie dans un instant.',
  relance: 'Choisis une date de relance entre demain et dans un an.',
};

const STATUS_TONE: Record<OfferStatus, 'neutral' | 'cyan' | 'gain' | 'warn'> = { nouvelle: 'cyan', negociee: 'warn', acceptee: 'gain', refusee: 'neutral' };

export default async function OffresPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/offres');
  const plan = getPlan(profile.plan);
  if (!plan.offersPerDay) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader eyebrow="Suivre" title="Propositions de marques"  description="Colle le message d’une marque : on le lit, on le note, et tu réponds en un clic." />
        <PlanGate plan="Pro+" title="Trie les propositions de marques en 10 secondes">
          Colle le message reçu : marque, commission, échantillon et conditions sont extraits, notés sur 100 face aux produits
          du radar, avec les points d’attention, trois réponses prêtes à copier et un rappel pour relancer.
        </PlanGate>
      </div>
    );
  }
  const repo = getRepo();
  const [records, left] = await Promise.all([repo.listRecords<OfferData>(profile.id, 'offre'), remainingToday(profile.id, 'offre', plan.offersPerDay)]);
  const current = records.find((r) => r.id === searchParams.offre) ?? null;
  const filter = searchParams.statut && searchParams.statut in OFFER_STATUS_LABELS ? (searchParams.statut as OfferStatus) : null;
  const history = filter ? records.filter((r) => r.data.status === filter) : records;
  const today = parisDate();
  const upcoming = records
    .filter((r) => r.data.follow_up_on && r.data.follow_up_on >= today && r.data.status !== 'acceptee' && r.data.status !== 'refusee')
    .sort((a, b) => a.data.follow_up_on!.localeCompare(b.data.follow_up_on!));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Suivre" title="Propositions de marques" description="Colle le message d’une marque : on le lit, on le note, et tu réponds en un clic." />
      {searchParams.erreur ? <Callout tone="rose" className="mb-6" title={ERRORS[searchParams.erreur] ?? ERRORS.ia} /> : null}
      {searchParams.ok === 'statut' ? <Callout tone="gain" className="mb-6" title="Statut et relance enregistrés." /> : null}
      {searchParams.ok === 'suppression' ? <Callout tone="neutral" className="mb-6" title="Proposition supprimée." /> : null}

      <Card>
        <form action={analyzeOfferAction} className="space-y-3">
          <Field label="Message de la marque" htmlFor="message" hint={`${left} analyse${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''} aujourd’hui.`}>
            <Textarea id="message" name="message" rows={6} required minLength={30} maxLength={6000} />
          </Field>
          <SubmitButton pendingLabel="Analyse…" disabled={left <= 0}>
            Analyser la proposition
          </SubmitButton>
        </form>
      </Card>

      {current ? <OfferResult id={current.id} data={current.data} today={today} /> : null}

      {upcoming.length ? (
        <Panel className="mt-8">
          <h2 className="flex items-center gap-2 text-lg">
            <BellRing className="h-5 w-5 text-cyan-ink" aria-hidden="true" />
            Relances prévues
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {upcoming.map((r) => (
              <li key={r.id}>
                <Link href={`/app/offres?offre=${r.id}`} className="hover:underline">
                  <span className="font-semibold first-letter:uppercase">{r.data.follow_up_on === today ? 'aujourd’hui' : formatLongDate(r.data.follow_up_on!)}</span>
                  <span className="text-muted"> · {r.data.extracted.brand ?? 'Marque non précisée'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {records.length ? (
        <section className="mt-8" aria-labelledby="historique">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="historique" className="text-lg">
              Historique
            </h2>
            <nav className="flex flex-wrap gap-1 text-sm" aria-label="Filtrer par statut">
              {[null, ...(Object.keys(OFFER_STATUS_LABELS) as OfferStatus[])].map((s) => (
                <Link
                  key={s ?? 'tous'}
                  href={s ? `/app/offres?statut=${s}` : '/app/offres'}
                  aria-current={filter === s ? 'page' : undefined}
                  className={cn('rounded-full px-3 py-1.5 font-semibold', filter === s ? 'bg-surface text-fg' : 'text-muted hover:text-fg')}
                >
                  {s ? OFFER_STATUS_LABELS[s] : 'Toutes'}
                </Link>
              ))}
            </nav>
          </div>
          {history.length ? (
            <ul className="space-y-2">
              {history.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/app/offres?offre=${r.id}`}
                    className={cn('flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-sm hover:border-line-strong', r.id === current?.id ? 'border-cyan-ink/40' : 'border-line')}
                  >
                    <span className="min-w-0">
                      <span className="line-clamp-1 font-medium">
                        {r.data.extracted.brand ?? 'Marque non précisée'}
                        {r.data.extracted.product ? ` · ${r.data.extracted.product}` : ''}
                      </span>
                      <span className="text-xs text-muted">
                        reçue le {formatShortDate(r.created_at.slice(0, 10))}
                        {r.data.follow_up_on && r.data.follow_up_on >= today ? ` · relance le ${formatShortDate(r.data.follow_up_on)}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone={STATUS_TONE[r.data.status]}>{OFFER_STATUS_LABELS[r.data.status]}</Badge>
                      <span className="num font-semibold">{r.data.score.score}/100</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune proposition avec ce statut.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function OfferResult({ id, data, today }: { id: string; data: OfferData; today: string }) {
  const e = data.extracted;
  const warnings = offerWarnings(e, data.score);
  const facts: Array<[string, string]> = [
    ['Marque', e.brand ?? 'non précisée'],
    ['Produit', e.product ?? 'non précisé'],
    ['Commission', e.commission_percent === null ? 'non précisée' : `${String(e.commission_percent).replace('.', ',')} %`],
    ['Rémunération fixe', e.fixed_fee_euros ? `${e.fixed_fee_euros} €` : 'aucune'],
    ['Échantillon', e.free_sample === null ? (e.sample_refundable ? 'remboursable' : 'non précisé') : e.free_sample ? (e.sample_refundable ? 'remboursable' : 'offert') : 'non offert'],
    ['Délai', e.deadline_days === null ? 'non précisé' : `${e.deadline_days} jours`],
    ['Exclusivité', e.exclusivity ? 'demandée' : 'non mentionnée'],
  ];
  const replies: Array<[keyof OfferData['replies'], string]> = [
    ['accepter', 'Accepter'],
    ['negocier', data.score.counterPercent !== null ? `Négocier (contre-proposition : ${data.score.counterPercent} %)` : 'Négocier'],
    ['refuser', 'Refuser poliment'],
  ];
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-6">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg">Ce que dit la proposition</h2>
            {data.simulated ? <Badge tone="neutral">Lecture simulée</Badge> : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {e.conditions.length ? (
            <>
              <h3 className="mt-4 text-sm font-semibold">Conditions</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                {e.conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>

        <section aria-labelledby="attention">
          <h2 id="attention" className="mb-2 text-lg">
            Points d’attention
          </h2>
          {warnings.length ? (
            <ul className="space-y-2">
              {warnings.map((w) => (
                <li key={w.code} className="flex gap-3 rounded-2xl border border-warn/40 bg-warn-soft p-3.5 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                  <span>
                    <span className="font-semibold">{w.title}.</span> {w.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-line p-3.5 text-sm text-muted">
              Rien d’inhabituel repéré dans le message. Relis quand même les conditions avant d’accepter.
            </p>
          )}
        </section>

        {replies.map(([key, label]) => (
          <Panel key={key}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{label}</h3>
              <CopyButton text={data.replies[key]} label="Copier la réponse" copiedLabel="Réponse copiée" />
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{data.replies[key]}</p>
          </Panel>
        ))}
      </div>
      <aside className="space-y-4">
        <Card className="border-fg/15">
          <p className="text-xs font-medium text-muted">Note de la proposition</p>
          <p className="num mt-1 text-4xl font-bold">
            {data.score.score}
            <span className="text-lg text-muted">/100</span>
          </p>
          {data.score.nicheAveragePercent != null || data.score.nicheMedianPercent !== null ? (
            <p className="mt-1 text-xs text-muted">
              Comparée à {data.score.comparedWith ? `${data.score.comparedWith} produits` : 'des produits'} du radar dans la niche :
              {data.score.nicheAveragePercent != null ? ` commission moyenne ${String(data.score.nicheAveragePercent).replace('.', ',')} %,` : ''}
              {data.score.nicheMedianPercent !== null ? ` médiane ${String(data.score.nicheMedianPercent).replace('.', ',')} %.` : ''}
            </p>
          ) : null}
          <ul className="mt-3 space-y-2 text-sm">
            {data.score.reasons.map((r) => (
              <li key={r.text} className={cn(r.tone === 'gain' ? 'text-gain' : r.tone === 'rose' ? 'text-rose-ink' : 'text-muted')}>
                {r.text}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <form action={setOfferStatusAction} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <Field label="Statut" htmlFor="statut">
              <Select id="statut" name="statut" defaultValue={data.status}>
                {Object.entries(OFFER_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Me rappeler de relancer le" htmlFor="relance" hint="Notification et e-mail le matin du jour choisi. Vide : pas de rappel.">
              <Input id="relance" name="relance" type="date" min={addDays(today, 1)} max={addDays(today, 365)} defaultValue={data.follow_up_on ?? ''} />
            </Field>
            <SubmitButton variant="outline" size="sm" pendingLabel="Enregistrement…">
              Enregistrer le suivi
            </SubmitButton>
          </form>
          {data.follow_up_on && data.follow_up_sent === data.follow_up_on ? (
            <p className="mt-2 text-xs text-muted">Rappel du {formatShortDate(data.follow_up_on)} envoyé.</p>
          ) : null}
        </Card>
        <form action={deleteOfferAction}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Suppression…">
            Supprimer la proposition
          </SubmitButton>
        </form>
      </aside>
    </div>
  );
}
