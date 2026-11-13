import { rhythmFor } from '@/lib/profile-rules';
import type { Metadata } from 'next';
import { CalendarDays, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { PlanGate } from '@/components/app/plan-gate';
import { MonthCalendar } from '@/components/v2/month-calendar';
import { LinkButton } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, EmptyState, PageHeader, ProgressBar } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { addDays, formatLongDate, parisDate } from '@/lib/utils';
import { loadMyProducts } from '@/lib/v2/my-products';
import { monthCalendar, parseMonth, planProgress, RHYTHMS } from '@/lib/v2/planning';
import { createPlanAction, unschedulePlanAction } from './actions';

export const metadata: Metadata = { title: 'Plan de publication' };

const RHYTHM_HINTS: Record<number, string> = { 3: 'lundi, mercredi, vendredi', 5: 'du lundi au vendredi', 7: 'tous les jours' };

export default async function PlanPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/plan');
  if (!getPlan(profile.plan).planning) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader eyebrow="Créer" title="Plan de publication"  description="Tenir 20 vidéos par produit, c’est là que l’affiliation paie. Rien n’est publié à ta place : tu reçois un rappel le jour J." />
        <PlanGate plan="Pro" title="20 vidéos par produit, au bon rythme">
          Choisis un produit suivi et ton rythme : ses vidéos sont réparties sur les semaines à venir dans un calendrier, avec
          un rappel le jour J par notification, e-mail et Discord, et un fichier à importer dans ton agenda.
        </PlanGate>
      </div>
    );
  }
  const today = parisDate();
  const { rows } = await loadMyProducts(getRepo(), profile, today);
  const month = parseMonth(searchParams.mois) ?? today.slice(0, 7);
  const scheduled = rows.filter((r) => r.board.data.rhythm);
  const weeks = monthCalendar(
    month,
    rows.map((r) => ({ id: r.board.id, data: r.board.data })),
  );
  const preselected = rows.some((r) => r.product.id === searchParams.produit) ? searchParams.produit : undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Créer"
        title="Plan de publication"
        description="Tenir 20 vidéos par produit, c’est là que l’affiliation paie. Rien n’est publié à ta place : tu reçois un rappel le jour J."
      />
      {searchParams.ok === 'cree' ? <Callout tone="gain" className="mb-6" title="Vidéos réparties dans le calendrier : rappel le jour J à l’heure de ton récap." /> : null}
      {searchParams.ok === 'retire' ? <Callout tone="neutral" className="mb-6" title="Calendrier retiré. Ton tableau de vidéos est intact." /> : null}
      {searchParams.erreur ? <Callout tone="rose" className="mb-6" title="Choisis un produit de « Mes produits » et un rythme." /> : null}

      <Card id="nouveau">
        <h2 className="text-lg">Planifier un produit</h2>
        <p className="mt-1 text-sm text-muted">Les vidéos pas encore postées sont réparties selon ton rythme. Refaire un plan le remplace.</p>
        {rows.length ? (
          <form action={createPlanAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_13rem_10rem_auto] lg:items-end">
            <Field label="Produit suivi" htmlFor="produit" className="sm:col-span-2 lg:col-span-1">
              <Select id="produit" name="produit" required defaultValue={preselected}>
                {rows.map((r) => (
                  <option key={r.product.id} value={r.product.id}>
                    {r.product.name.slice(0, 80)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rythme" htmlFor="rythme">
              <Select id="rythme" name="rythme" defaultValue={String(rhythmFor(profile.videos_per_week))}>
                {RHYTHMS.map((r) => (
                  <option key={r} value={r}>
                    {r} par semaine ({RHYTHM_HINTS[r]})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="À partir du" htmlFor="debut">
              <Input id="debut" name="debut" type="date" min={today} defaultValue={addDays(today, 1)} />
            </Field>
            <SubmitButton pendingLabel="Répartition…">Planifier les vidéos</SubmitButton>
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

      <Card className="mt-6">
        <MonthCalendar month={month} weeks={weeks} today={today} hrefFor={(m) => `/app/plan?mois=${m}`} />
      </Card>

      {scheduled.length ? (
        <section className="mt-6 space-y-3" aria-labelledby="plans-en-cours">
          <h2 id="plans-en-cours" className="text-lg">
            Produits planifiés
          </h2>
          {scheduled.map(({ board, product }) => {
            const plan = board.data;
            const progress = planProgress(plan);
            const next = plan.items.filter((i) => i.status !== 'poste' && i.date && i.date >= today).sort((a, b) => a.date!.localeCompare(b.date!))[0];
            const late = plan.items.filter((i) => i.status !== 'poste' && i.date && i.date < today).length;
            return (
              <Card key={board.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-base">{product.name}</h3>
                    <p className="text-sm text-muted">
                      {plan.rhythm} vidéos par semaine · {progress.posted}/{progress.total} postées
                      {next ? ` · prochaine : ${next.date === today ? 'aujourd’hui' : formatLongDate(next.date!)}` : ''}
                    </p>
                    {late ? <p className="mt-1 text-sm text-warn">{late} vidéo{late > 1 ? 's' : ''} en retard : replanifie pour les répartir à nouveau.</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <LinkButton href={`/app/mes-produits/${encodeURIComponent(product.id)}`} variant="outline" size="sm">
                      <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                      Ouvrir le tableau
                    </LinkButton>
                    <LinkButton href={`/api/plan/${board.id}/ics`} variant="outline" size="sm" prefetch={false}>
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      Exporter le calendrier
                    </LinkButton>
                    <form action={unschedulePlanAction}>
                      <input type="hidden" name="plan" value={board.id} />
                      <SubmitButton variant="ghost" size="sm" pendingLabel="Retrait…">
                        Retirer du calendrier
                      </SubmitButton>
                    </form>
                  </div>
                </div>
                <ProgressBar className="mt-3" value={progress.posted} max={progress.total} label={`Vidéos postées sur ${product.name}`} />
              </Card>
            );
          })}
        </section>
      ) : rows.length ? (
        <EmptyState title="Aucun produit planifié" className="mt-6">
          Choisis un produit et un rythme ci-dessus : ses vidéos sont réparties sur les semaines à venir.
        </EmptyState>
      ) : null}
    </div>
  );
}
