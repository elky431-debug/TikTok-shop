import type { Metadata } from 'next';
import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { PlanGate } from '@/components/app/plan-gate';
import { LinkButton } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, EmptyState, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { cn, formatShortDate, parisDate } from '@/lib/utils';
import { planProgress, RHYTHMS, type PlanItemStatus, type PublicationPlan } from '@/lib/v2/planning';
import { createPlanAction, deletePlanAction, setPlanItemAction } from './actions';

export const metadata: Metadata = { title: 'Plan de publication' };

const NEXT_STATUS: Record<PlanItemStatus, { next: PlanItemStatus; label: string }> = {
  a_tourner: { next: 'tourne', label: 'Tournée' },
  tourne: { next: 'poste', label: 'Postée' },
  poste: { next: 'a_tourner', label: 'Annuler' },
};
const STATUS_LABEL: Record<PlanItemStatus, string> = { a_tourner: 'À tourner', tourne: 'Tournée', poste: 'Postée' };

export default async function PlanPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/plan');
  if (!getPlan(profile.plan).planning) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Plan de publication" />
        <PlanGate plan="Pro" title="20 vidéos par produit, au bon rythme">
          Choisis un produit suivi et ton rythme : les 20 vidéos sont réparties sur les semaines à venir, avec un rappel le
          jour J par e-mail et Discord, et un calendrier à importer.
        </PlanGate>
      </div>
    );
  }
  const repo = getRepo();
  const [plans, saved] = await Promise.all([repo.listRecords<PublicationPlan>(profile.id, 'publication'), repo.listSavedProducts(profile.id)]);
  const products = await repo.getProducts(saved.map((s) => s.product_id));
  const today = parisDate();

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Plan de publication"
        description="Tenir 20 vidéos par produit, c’est là que l’affiliation paie. Rien n’est publié à ta place : tu reçois un rappel le jour J."
      />
      {searchParams.ok === 'cree' ? <Callout tone="gain" className="mb-6" title="Plan créé : premier rappel demain." /> : null}
      {searchParams.erreur ? <Callout tone="rose" className="mb-6" title="Choisis un produit de « Mes produits » et un rythme." /> : null}

      <Card>
        <h2 className="text-lg">Nouveau plan</h2>
        {products.length ? (
          <form action={createPlanAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Field label="Produit suivi" htmlFor="produit">
              <Select id="produit" name="produit" required>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.slice(0, 80)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rythme" htmlFor="rythme">
              <Select id="rythme" name="rythme" defaultValue="5">
                {RHYTHMS.map((r) => (
                  <option key={r} value={r}>
                    {r} vidéos par semaine
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton pendingLabel="Création…">Créer le plan</SubmitButton>
          </form>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Ajoute d’abord un produit à{' '}
            <Link href="/app/mes-produits" className="font-semibold text-fg underline">
              Mes produits
            </Link>{' '}
            depuis le radar.
          </p>
        )}
      </Card>

      {plans.length ? (
        <div className="mt-6 space-y-6">
          {plans.map((record) => {
            const plan = record.data;
            const progress = planProgress(plan);
            return (
              <Card key={record.id} id={`plan-${record.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-lg">{plan.product_name}</h2>
                    <p className="text-sm text-muted">
                      {plan.rhythm} vidéos par semaine · {progress.posted}/{progress.total} postées
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <LinkButton href={`/api/plan/${record.id}/ics`} variant="outline" size="sm">
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      Exporter le calendrier
                    </LinkButton>
                    <form action={deletePlanAction}>
                      <input type="hidden" name="plan" value={record.id} />
                      <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                        Supprimer
                      </SubmitButton>
                    </form>
                  </div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-surface" aria-hidden="true">
                  <div className="h-full rounded-full bg-gain" style={{ width: `${(progress.posted / progress.total) * 100}%` }} />
                </div>
                <ol className="mt-4 grid gap-2 sm:grid-cols-2">
                  {plan.items.map((item) => (
                    <li
                      key={item.n}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm',
                        item.date === today && item.status !== 'poste' ? 'border-cyan-ink/50 bg-cyan-ink/5' : 'border-line',
                      )}
                    >
                      <span>
                        <span className="num font-semibold">n°{item.n}</span>
                        <span className="text-muted"> · {item.date === today ? 'aujourd’hui' : formatShortDate(item.date)}</span>
                        <span className={cn('ml-2 text-xs', item.status === 'poste' ? 'text-gain' : 'text-muted')}>{STATUS_LABEL[item.status]}</span>
                      </span>
                      <form action={setPlanItemAction}>
                        <input type="hidden" name="plan" value={record.id} />
                        <input type="hidden" name="n" value={item.n} />
                        <input type="hidden" name="statut" value={NEXT_STATUS[item.status].next} />
                        <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                          {NEXT_STATUS[item.status].label}
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ol>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Pas encore de plan" className="mt-6">
          Crée ton premier plan : 20 vidéos réparties sur les semaines à venir.
        </EmptyState>
      )}
    </div>
  );
}
