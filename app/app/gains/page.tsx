import type { Metadata } from 'next';
import { PlanGate } from '@/components/app/plan-gate';
import { Field, Input, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, EmptyState, PageHeader, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { cn, formatDayMonth, formatEuros, formatInt, formatShortDate, parisDate } from '@/lib/utils';
import { earningsDashboard, type EarningData } from '@/lib/v2/earnings';
import { addEarningAction, deleteEarningAction, importEarningsAction } from './actions';

export const metadata: Metadata = { title: 'Mes gains' };

export default async function GainsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/gains');
  if (!getPlan(profile.plan).earnings) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Mes gains" />
        <PlanGate plan="Pro" title="Suis ce que tu gagnes, produit par produit">
          Note tes commissions à la main ou importe ton relevé en CSV : gains par produit, par vidéo et par semaine.
        </PlanGate>
      </div>
    );
  }
  const records = await getRepo().listRecords<EarningData>(profile.id, 'gain');
  const entries = records.map((r) => r.data);
  const today = parisDate();
  const board = earningsDashboard(entries, today);
  const maxWeek = Math.max(1, ...board.byWeek.map((w) => w.cents));
  const message =
    searchParams.ok === 'ajout'
      ? { tone: 'gain' as const, text: 'Gain enregistré.' }
      : searchParams.ok === 'import'
        ? { tone: 'gain' as const, text: `${searchParams.lignes} lignes importées${Number(searchParams.ignorees) ? `, ${searchParams.ignorees} ignorées` : ''}.` }
        : searchParams.ok === 'suppression'
          ? { tone: 'gain' as const, text: 'Ligne supprimée.' }
          : searchParams.erreur === 'saisie'
            ? { tone: 'rose' as const, text: 'Indique une date, un produit et un montant (exemple : 12,50).' }
            : searchParams.erreur === 'import'
              ? { tone: 'rose' as const, text: searchParams.detail || 'Le fichier n’a pas pu être lu.' }
              : searchParams.erreur
                ? { tone: 'rose' as const, text: 'Choisis un fichier CSV (2 Mo au plus) ou colle son contenu.' }
                : null;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Mes gains" description="Tes commissions, saisies par toi ou importées. Tes chiffres restent privés." />
      {message ? <Callout tone={message.tone} className="mb-6" title={message.text} /> : null}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {[
          { label: 'Ce mois-ci', value: formatEuros(board.monthCents) },
          { label: 'Depuis le début', value: formatEuros(board.totalCents) },
          { label: 'Produit le plus rentable', value: board.bestProduct?.name ?? '—', small: true },
          { label: 'Lignes', value: formatInt(board.entries) },
        ].map((item) => (
          <div key={item.label} className="bg-raised p-3.5">
            <dt className="text-xs font-medium text-muted">{item.label}</dt>
            <dd className={cn('num mt-1 font-semibold', item.small ? 'line-clamp-2 text-sm' : 'text-xl text-gain')}>{item.value}</dd>
          </div>
        ))}
      </dl>

      {entries.length ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="text-lg">Par semaine</h2>
            <ol className="mt-4 space-y-2" aria-label="Gains des 8 dernières semaines">
              {board.byWeek.map((w) => (
                <li key={w.start} className="grid grid-cols-[4.5rem_1fr_5rem] items-center gap-3 text-sm">
                  <span className="text-muted">{formatDayMonth(w.start)}</span>
                  <span className="h-2.5 rounded-full bg-surface">
                    <span className="block h-full rounded-full bg-cyan-ink" style={{ width: `${(w.cents / maxWeek) * 100}%` }} />
                  </span>
                  <span className="num text-right font-medium">{formatEuros(w.cents)}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card>
            <h2 className="text-lg">Par produit</h2>
            <ul className="mt-3 divide-y divide-line">
              {board.byProduct.slice(0, 8).map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="line-clamp-1 font-medium">{p.name}</span>
                    <span className="text-xs text-muted">
                      {p.videos ? `${p.videos} vidéo${p.videos > 1 ? 's' : ''}` : 'sans vidéo notée'}
                      {p.sales ? ` · ${formatInt(p.sales)} ventes` : ''}
                    </span>
                  </span>
                  <span className="num shrink-0 font-semibold text-gain">{formatEuros(p.cents)}</span>
                </li>
              ))}
            </ul>
          </Card>
          {board.byVideo.length ? (
            <Card className="lg:col-span-2">
              <h2 className="text-lg">Par vidéo</h2>
              <ul className="mt-3 divide-y divide-line">
                {board.byVideo.map((v) => (
                  <li key={`${v.product}-${v.video}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="line-clamp-1 font-medium">{v.video}</span>
                      <span className="line-clamp-1 text-xs text-muted">{v.product}</span>
                    </span>
                    <span className="num shrink-0 font-semibold">{formatEuros(v.cents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : (
        <EmptyState title="Aucun gain noté pour l’instant" className="mt-6">
          Ajoute ta première commission ci-dessous, ou importe le relevé que tu télécharges depuis TikTok Shop.
        </EmptyState>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg">Ajouter un gain</h2>
          <form action={addEarningAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Date" htmlFor="date">
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Montant (€)" htmlFor="montant">
              <Input id="montant" name="montant" inputMode="decimal" placeholder="12,50" required />
            </Field>
            <Field label="Produit" htmlFor="produit" className="sm:col-span-2">
              <Input id="produit" name="produit" required maxLength={200} />
            </Field>
            <Field label="Vidéo (facultatif)" htmlFor="video" hint="Un titre, un lien ou un numéro.">
              <Input id="video" name="video" maxLength={300} />
            </Field>
            <Field label="Ventes (facultatif)" htmlFor="ventes">
              <Input id="ventes" name="ventes" type="number" min={0} />
            </Field>
            <SubmitButton className="sm:col-span-2" pendingLabel="Enregistrement…">
              Enregistrer le gain
            </SubmitButton>
          </form>
        </Card>
        <Card>
          <h2 className="text-lg">Importer un CSV</h2>
          <p className="mt-1 text-sm text-muted">
            Colonnes reconnues : date, produit, montant (obligatoires), vidéo et ventes. Séparateur « ; » ou « , ».
          </p>
          <form action={importEarningsAction} className="mt-4 space-y-3">
            <Field label="Fichier CSV" htmlFor="fichier">
              <Input id="fichier" name="fichier" type="file" accept=".csv,text/csv" />
            </Field>
            <Field label="Ou colle le contenu" htmlFor="texte">
              <Textarea id="texte" name="texte" rows={4} placeholder={'date;produit;montant\n12/11/2026;Sérum éclat;12,50'} />
            </Field>
            <SubmitButton variant="outline" pendingLabel="Import…">
              Importer les gains
            </SubmitButton>
          </form>
        </Card>
      </div>

      {records.length ? (
        <Panel className="mt-6">
          <h2 className="text-lg">Dernières lignes</h2>
          <ul className="mt-3 divide-y divide-line">
            {records.slice(0, 30).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="line-clamp-1">{r.data.product_name}</span>
                  <span className="text-xs text-muted">
                    {formatShortDate(r.data.date)}
                    {r.data.video ? ` · ${r.data.video}` : ''} · {r.data.source === 'import' ? 'importé' : 'saisi'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="num font-semibold">{formatEuros(r.data.amount_cents)}</span>
                  <form action={deleteEarningAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                      Supprimer
                    </SubmitButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
