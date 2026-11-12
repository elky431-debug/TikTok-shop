import type { Metadata } from 'next';
import Link from 'next/link';
import { PlanGate } from '@/components/app/plan-gate';
import { CopyButton } from '@/components/ui/copy-button';
import { Field, Select, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, PageHeader, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { cn, formatShortDate } from '@/lib/utils';
import { OFFER_STATUS_LABELS, type OfferData } from '@/lib/v2/offers';
import { remainingToday } from '@/lib/v2/quota';
import { analyzeOfferAction, setOfferStatusAction } from './actions';

export const metadata: Metadata = { title: 'Propositions de marques' };

const ERRORS: Record<string, string> = {
  court: 'Colle le message complet de la marque (30 caractères au moins).',
  quota: 'Tu as atteint le nombre d’analyses du jour. Reviens demain.',
  ia: 'L’analyse n’a pas pu être faite. Réessaie dans un instant.',
};

export default async function OffresPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/offres');
  const plan = getPlan(profile.plan);
  if (!plan.offersPerDay) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Propositions de marques" />
        <PlanGate plan="Pro+" title="Trie les propositions de marques en 10 secondes">
          Colle le message reçu : marque, commission, échantillon et conditions sont extraits, notés sur 100 face aux produits
          du radar, avec une réponse prête à copier.
        </PlanGate>
      </div>
    );
  }
  const repo = getRepo();
  const [records, left] = await Promise.all([repo.listRecords<OfferData>(profile.id, 'offre'), remainingToday(profile.id, 'offre', plan.offersPerDay)]);
  const current = records.find((r) => r.id === searchParams.offre) ?? null;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Propositions de marques" description="Colle le message d’une marque : on le lit, on le note, et tu réponds en un clic." />
      {searchParams.erreur ? <Callout tone="rose" className="mb-6" title={ERRORS[searchParams.erreur] ?? ERRORS.ia} /> : null}

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

      {current ? <OfferResult id={current.id} data={current.data} /> : null}

      {records.length ? (
        <section className="mt-8" aria-labelledby="historique">
          <h2 id="historique" className="mb-3 text-lg">
            Historique
          </h2>
          <ul className="space-y-2">
            {records.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/offres?offre=${r.id}`}
                  className={cn('flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-sm hover:border-line-strong', r.id === current?.id ? 'border-cyan-ink/40' : 'border-line')}
                >
                  <span className="min-w-0">
                    <span className="line-clamp-1 font-medium">{r.data.extracted.brand ?? 'Marque non précisée'}{r.data.extracted.product ? ` · ${r.data.extracted.product}` : ''}</span>
                    <span className="text-xs text-muted">{formatShortDate(r.created_at.slice(0, 10))}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={r.data.status === 'refusee' ? 'neutral' : 'ink'}>{OFFER_STATUS_LABELS[r.data.status]}</Badge>
                    <span className="num font-semibold">{r.data.score.score}/100</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function OfferResult({ id, data }: { id: string; data: OfferData }) {
  const e = data.extracted;
  const facts: Array<[string, string]> = [
    ['Marque', e.brand ?? 'non précisée'],
    ['Produit', e.product ?? 'non précisé'],
    ['Commission', e.commission_percent === null ? 'non précisée' : `${String(e.commission_percent).replace('.', ',')} %`],
    ['Rémunération fixe', e.fixed_fee_euros ? `${e.fixed_fee_euros} €` : 'aucune'],
    ['Échantillon', e.free_sample === null ? 'non précisé' : e.free_sample ? (e.sample_refundable ? 'remboursable' : 'offert') : 'non offert'],
    ['Délai', e.deadline_days === null ? 'non précisé' : `${e.deadline_days} jours`],
  ];
  const replies: Array<[keyof OfferData['replies'], string]> = [
    ['accepter', 'Accepter'],
    ['negocier', data.score.counterPercent !== null ? `Négocier (${data.score.counterPercent} %)` : 'Négocier'],
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
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {e.conditions.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
              {e.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
        </Card>
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
          {data.score.nicheMedianPercent !== null ? (
            <p className="mt-1 text-xs text-muted">Commission médiane du radar dans la niche : {String(data.score.nicheMedianPercent).replace('.', ',')} %</p>
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
            <SubmitButton variant="outline" size="sm" pendingLabel="Enregistrement…">
              Enregistrer le statut
            </SubmitButton>
          </form>
        </Card>
      </aside>
    </div>
  );
}
