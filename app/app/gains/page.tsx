import type { Metadata } from 'next';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { PlanGate } from '@/components/app/plan-gate';
import { BarList } from '@/components/v2/bar-list';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, EmptyState, PageHeader, Panel, ProgressBar } from '@/components/ui/surface';
import { SCRIPT_FORMATS, formatLabel } from '@/lib/ai/formats';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { NICHES, nicheShort } from '@/lib/niches';
import { getPlan } from '@/lib/plans';
import { cn, formatDayMonth, formatEuros, formatInt, formatShortDate, parisDate, plural } from '@/lib/utils';
import { earningsDashboard, EARNINGS_KIND, EARNING_FIELDS, goalProgress, NO_TAX_ADVICE, type EarningData } from '@/lib/v2/earnings';
import { getEarningsGoal, getMapping } from '@/lib/v2/earnings-store';
import { addEarningAction, deleteEarningAction, forgetMappingAction, setEarningsGoalAction, startImportAction } from './actions';

export const metadata: Metadata = { title: 'Mes gains' };

const VIEWS = { jour: '14 derniers jours', semaine: '8 dernières semaines', mois: '6 derniers mois' } as const;
type View = keyof typeof VIEWS;

const monthName = (month: string) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`));

function message(searchParams: Record<string, string | undefined>): { tone: 'gain' | 'rose' | 'neutral'; text: string } | null {
  const n = (key: string) => Number(searchParams[key]) || 0;
  switch (searchParams.ok) {
    case 'ajout':
      return { tone: 'gain', text: 'Gain enregistré.' };
    case 'import':
      return {
        tone: 'gain',
        text: `${n('lignes')} ligne${n('lignes') > 1 ? 's' : ''} importée${n('lignes') > 1 ? 's' : ''}${n('doublons') ? `, ${n('doublons')} déjà présente${n('doublons') > 1 ? 's' : ''}` : ''}${n('ignorees') ? `, ${n('ignorees')} illisible${n('ignorees') > 1 ? 's' : ''}` : ''}.${searchParams.memorise ? ' Colonnes mémorisées pour la prochaine fois.' : ''}`,
      };
    case 'suppression':
      return { tone: 'gain', text: 'Ligne supprimée.' };
    case 'objectif':
      return { tone: 'gain', text: 'Objectif du mois enregistré.' };
    case 'annule':
      return { tone: 'neutral', text: 'Import annulé : rien n’a été ajouté.' };
    case 'oubli':
      return { tone: 'neutral', text: 'Correspondance oubliée : tu choisiras les colonnes au prochain import.' };
  }
  switch (searchParams.erreur) {
    case undefined:
      return null;
    case 'saisie':
      return { tone: 'rose', text: 'Indique une date, un produit et un montant (exemple : 12,50).' };
    case 'objectif':
      return { tone: 'rose', text: 'Indique un montant en euros (exemple : 300), ou laisse vide pour retirer l’objectif.' };
    case 'taille':
      return { tone: 'rose', text: 'Fichier trop lourd : 2 Mo au plus.' };
    case 'vide':
      return { tone: 'rose', text: 'Le fichier doit avoir une ligne d’en-têtes et au moins une ligne de gains.' };
    case 'expire':
      return { tone: 'rose', text: 'Cet import n’existe plus : envoie le fichier à nouveau.' };
    default:
      return { tone: 'rose', text: 'Choisis un fichier CSV (2 Mo au plus) ou colle son contenu.' };
  }
}

export default async function GainsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/gains');
  if (!getPlan(profile.plan).earnings) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader eyebrow="Suivre" title="Mes gains"  description="Tes commissions, saisies par toi ou importées. Tes chiffres restent privés." />
        <PlanGate plan="pro" title="Suis ce que tu gagnes, produit par produit">
          Note tes commissions à la main ou importe ton relevé en CSV : gains par jour, semaine et mois, par produit, par
          format et par niche, objectif du mois et export pour ta comptabilité.
        </PlanGate>
      </div>
    );
  }
  const repo = getRepo();
  const [records, goal, mapping, saved] = await Promise.all([
    repo.listRecords<EarningData>(profile.id, EARNINGS_KIND),
    getEarningsGoal(repo, profile.id),
    getMapping(repo, profile.id),
    repo.listSavedProducts(profile.id),
  ]);
  const products = await repo.getProducts(saved.map((s) => s.product_id));
  const entries = records.map((r) => r.data);
  const today = parisDate();
  const board = earningsDashboard(entries, today);
  const progress = goalProgress(board.monthCents, goal.cents);
  const view: View = searchParams.vue === 'jour' || searchParams.vue === 'mois' ? searchParams.vue : 'semaine';
  const series =
    view === 'jour'
      ? board.byDay.map((d) => ({ key: d.date, label: formatShortDate(d.date), cents: d.cents }))
      : view === 'mois'
        ? board.byMonth.map((m) => ({ key: m.month, label: monthName(m.month), cents: m.cents }))
        : board.byWeek.map((w) => ({ key: w.start, label: `sem. du ${formatDayMonth(w.start)}`, cents: w.cents }));
  const notice = message(searchParams);
  const fieldLabel = (key: string) => EARNING_FIELDS.find((f) => f.key === key)?.label ?? key;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Suivre"
        title="Mes gains"
        description="Tes commissions, saisies par toi ou importées. Tes chiffres restent privés."
        actions={
          entries.length ? (
            <a href="/api/gains/export" download className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:bg-surface">
              <Download className="h-4 w-4" aria-hidden="true" />
              Exporter en CSV
            </a>
          ) : null
        }
      />
      {notice ? <Callout tone={notice.tone} className="mb-6" title={notice.text} /> : null}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {[
          { label: 'Ce mois-ci', value: formatEuros(board.monthCents), big: true },
          { label: 'Gain moyen par vidéo', value: board.averagePerVideoCents === null ? '—' : formatEuros(board.averagePerVideoCents), big: true },
          { label: 'Meilleur produit', value: board.bestProduct?.name ?? '—' },
          { label: 'Meilleur format', value: board.bestFormat?.label ?? '—' },
        ].map((item) => (
          <div key={item.label} className="bg-raised p-3.5">
            <dt className="text-xs font-medium text-muted">{item.label}</dt>
            <dd className={cn('num mt-1 font-semibold', item.big ? 'text-xl text-gain' : 'line-clamp-2 text-sm')}>{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">
        Depuis le début : <span className="num font-semibold text-fg">{formatEuros(board.totalCents)}</span> sur {plural(board.entries, 'ligne')}
        {board.videos ? `, ${plural(board.videos, 'vidéo notée', 'vidéos notées')}` : ''}. Le gain moyen ne compte que les lignes rattachées à une vidéo.
      </p>

      <Card id="objectif-mois" className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg">Objectif de {monthName(today.slice(0, 7))}</h2>
          {progress ? (
            <p className={cn('text-sm', progress.leftCents === 0 ? 'font-semibold text-gain' : 'text-muted')}>
              {progress.leftCents === 0 ? 'Atteint.' : `Encore ${formatEuros(progress.leftCents)}`}
            </p>
          ) : null}
        </div>
        {progress && goal.cents ? (
          <>
            <ProgressBar className="mt-3" value={board.monthCents} max={goal.cents} label={`Gains du mois sur l’objectif de ${formatEuros(goal.cents)}`} />
            <p className="num mt-2 text-sm text-muted">
              {formatEuros(board.monthCents)} sur {formatEuros(goal.cents)} ({Math.round(progress.ratio * 100)} %)
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">Fixe-toi un montant pour le mois : la barre suit tes gains notés.</p>
        )}
        <form action={setEarningsGoalAction} className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Objectif du mois (€)" htmlFor="objectif">
            <Input id="objectif" name="objectif" inputMode="decimal" placeholder="300" defaultValue={goal.cents ? String(goal.cents / 100).replace('.', ',') : ''} className="w-36" />
          </Field>
          <SubmitButton variant="outline" size="sm" className="h-11" pendingLabel="Enregistrement…">
            Enregistrer l’objectif
          </SubmitButton>
        </form>
      </Card>

      {entries.length ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg">Gains : {VIEWS[view]}</h2>
              <nav className="flex gap-1 rounded-xl bg-surface p-1 text-sm" aria-label="Période">
                {(Object.keys(VIEWS) as View[]).map((v) => (
                  <Link
                    key={v}
                    href={`/app/gains?vue=${v}`}
                    scroll={false}
                    aria-current={v === view ? 'page' : undefined}
                    className={cn('rounded-lg px-3 py-1.5 font-semibold first-letter:uppercase', v === view ? 'bg-raised text-fg' : 'text-muted hover:text-fg')}
                  >
                    {v === 'jour' ? 'Jour' : v === 'semaine' ? 'Semaine' : 'Mois'}
                  </Link>
                ))}
              </nav>
            </div>
            <BarList items={series} label={`Gains, ${VIEWS[view]}`} />
          </Card>
          <Card>
            <h2 className="text-lg">Par produit</h2>
            <BarList
              tone="gain"
              label="Gains par produit"
              items={board.byProduct.slice(0, 8).map((p) => ({
                key: p.name,
                label: p.name,
                hint: [p.videos ? plural(p.videos, 'vidéo') : null, p.sales ? `${formatInt(p.sales)} ventes` : null].filter(Boolean).join(' · ') || undefined,
                cents: p.cents,
              }))}
            />
          </Card>
          <Card>
            <h2 className="text-lg">Par format de vidéo</h2>
            <BarList label="Gains par format" items={board.byFormat} empty="Indique le format quand tu notes un gain pour comparer tes formats." />
          </Card>
          <Card>
            <h2 className="text-lg">Par niche</h2>
            <BarList label="Gains par niche" items={board.byNiche} empty="La niche est reprise des produits suivis, ou indiquée à la saisie." />
          </Card>
          <Card>
            <h2 className="text-lg">Par vidéo</h2>
            {board.byVideo.length ? (
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
            ) : (
              <p className="mt-3 text-sm text-muted">Note la vidéo concernée quand tu ajoutes un gain pour voir tes meilleures vidéos.</p>
            )}
          </Card>
        </div>
      ) : (
        <EmptyState title="Aucun gain noté pour l’instant" className="mt-6">
          Ajoute ta première commission ci-dessous, ou importe le relevé que tu télécharges depuis TikTok Shop.
        </EmptyState>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card id="ajouter">
          <h2 className="text-lg">Ajouter un gain</h2>
          <p className="mt-1 text-sm text-muted">Pour une vidéo précise, ou pour le produit entier (laisse « Vidéo » vide).</p>
          <form action={addEarningAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Date" htmlFor="date">
              <Input id="date" name="date" type="date" defaultValue={today} max={today} required />
            </Field>
            <Field label="Montant (€)" htmlFor="montant">
              <Input id="montant" name="montant" inputMode="decimal" placeholder="12,50" required />
            </Field>
            <Field label="Produit" htmlFor="produit" className="sm:col-span-2" hint={products.length ? 'Tes produits suivis sont proposés.' : undefined}>
              <Input id="produit" name="produit" required maxLength={200} list="produits-suivis" autoComplete="off" />
              <datalist id="produits-suivis">
                {products.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Vidéo (facultatif)" htmlFor="video" hint="Un titre, un lien ou un numéro.">
              <Input id="video" name="video" maxLength={300} />
            </Field>
            <Field label="Ventes (facultatif)" htmlFor="ventes">
              <Input id="ventes" name="ventes" type="number" min={0} inputMode="numeric" />
            </Field>
            <Field label="Format (facultatif)" htmlFor="format">
              <Select id="format" name="format" defaultValue="">
                <option value="">Non précisé</option>
                {SCRIPT_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Niche (facultatif)" htmlFor="niche" hint="Reprise du produit suivi si tu la laisses vide.">
              <Select id="niche" name="niche" defaultValue="">
                <option value="">Non précisée</option>
                {NICHES.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton className="sm:col-span-2" pendingLabel="Enregistrement…">
              Enregistrer le gain
            </SubmitButton>
          </form>
        </Card>
        <Card id="importer">
          <h2 className="text-lg">Importer un CSV</h2>
          {mapping ? (
            <div className="mt-2 rounded-xl bg-surface p-3 text-sm">
              <p className="font-semibold">Colonnes mémorisées</p>
              <p className="mt-1 text-muted">
                {Object.entries(mapping.data.mapping)
                  .map(([field, col]) => `${fieldLabel(field)} ← « ${col} »`)
                  .join(' · ')}
              </p>
              <form action={forgetMappingAction} className="mt-2">
                <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                  Oublier ces colonnes
                </SubmitButton>
              </form>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">
              À la première importation, tu choisis quelle colonne contient la date, le produit et le montant. On s’en souvient ensuite.
            </p>
          )}
          <form action={startImportAction} className="mt-4 space-y-3">
            <Field label="Fichier CSV" htmlFor="fichier" hint="Séparateur « ; », « , » ou tabulation. 2 Mo au plus.">
              <Input id="fichier" name="fichier" type="file" accept=".csv,.tsv,.txt,text/csv" className="py-2" />
            </Field>
            <Field label="Ou colle le contenu" htmlFor="texte">
              <Textarea id="texte" name="texte" rows={4} placeholder={'date;produit;montant\n12/11/2026;Sérum éclat;12,50'} />
            </Field>
            {mapping ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="revoir" className="h-4 w-4 accent-[rgb(var(--cyan-ink))]" />
                Choisir les colonnes à nouveau
              </label>
            ) : null}
            <SubmitButton variant="outline" pendingLabel="Lecture du fichier…">
              Importer les gains
            </SubmitButton>
          </form>
        </Card>
      </div>

      {records.length ? (
        <Panel id="lignes" className="mt-6">
          <h2 className="text-lg">Dernières lignes</h2>
          <ul className="mt-3 divide-y divide-line">
            {records.slice(0, 30).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="line-clamp-1">{r.data.product_name}</span>
                  <span className="text-xs text-muted">
                    {formatShortDate(r.data.date)}
                    {r.data.video ? ` · ${r.data.video}` : ' · produit entier'}
                    {r.data.format ? ` · ${formatLabel(r.data.format)}` : ''}
                    {r.data.niche ? ` · ${nicheShort(r.data.niche)}` : ''} · {r.data.source === 'import' ? 'importé' : 'saisi'}
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

      <p className="mt-6 text-xs text-muted">{NO_TAX_ADVICE}</p>
    </div>
  );
}
