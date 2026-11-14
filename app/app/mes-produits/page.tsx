import type { Metadata } from 'next';
import { Flame, LayoutGrid, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { fallbackImageUrl } from '@/lib/product-image';
import { ProductImage, TrendBadge } from '@/components/product/bits';
import { DeclineCallout } from '@/components/v2/decline-callout';
import { LinkButton } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, EmptyState, PageHeader, ProgressBar } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { commissionPerSale } from '@/lib/score';
import { cn, formatEuros, formatInt, parisDate, plural } from '@/lib/utils';
import { loadMyProducts, type MyProductRow } from '@/lib/v2/my-products';
import { MAX_WEEKLY_GOAL, planProgress, STATUS_LABELS } from '@/lib/v2/planning';
import { removeSavedProductAction, setVideoGoalAction, setWeeklyGoalAction } from './actions';
import { displayName } from '@/lib/product-name';

export const metadata: Metadata = { title: 'Mes produits' };

function Row({ row }: { row: MyProductRow }) {
  const { product, board } = row;
  const progress = planProgress(board.data);
  const done = progress.posted >= progress.total;
  const href = `/app/mes-produits/${encodeURIComponent(product.id)}`;
  return (
    <li className={cn('rounded-2xl border bg-raised p-4 sm:p-5', row.declining ? 'border-warn/40' : 'border-line')}>
      <div className="flex gap-3.5">
        <Link href={href} className="shrink-0" tabIndex={-1} aria-hidden="true">
          <ProductImage src={product.image_url} fallback={fallbackImageUrl(product.id, product.niche)} alt="" className="w-16" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={href} className="font-semibold leading-snug hover:underline hover:underline-offset-4">
            {displayName(product)}
          </Link>
          <p className="num mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-semibold text-gain">{formatEuros(commissionPerSale(product.price_cents, product.commission_rate))} / vente</span>
            <TrendBadge trend={product.trend} growth={product.growth_7d} measured={product.latest_breakdown?.growth_7d !== null} />
          </p>
        </div>
        <form action={removeSavedProductAction}>
          <input type="hidden" name="produit" value={product.id} />
          <button
            type="submit"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-fg"
            aria-label={`Retirer ${displayName(product)} de mes produits`}
            title="Retirer de mes produits"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>

      {row.declining ? <DeclineCallout product={product} replacements={row.replacements} paid={row.replacements.length > 0} className="mt-3" /> : null}

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-semibold">
            <span className="num">{formatInt(progress.posted)}</span> / <span className="num">{progress.total}</span> vidéos postées
          </span>
          <span className={cn('text-muted', done && 'font-semibold text-gain')}>
            {done ? 'Objectif atteint' : `Encore ${plural(progress.total - progress.posted, 'vidéo')}`}
          </span>
        </div>
        <ProgressBar value={progress.posted} max={progress.total} label={`Vidéos postées sur ${product.name}`} />
        <p className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            {STATUS_LABELS.a_tourner} : {progress.todo}
          </span>
          <span>
            {STATUS_LABELS.tourne} : {progress.filmed}
          </span>
          <span>
            {STATUS_LABELS.poste} : {progress.posted}
          </span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <LinkButton href={href} size="sm" className="h-10">
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          Ouvrir le tableau
        </LinkButton>
        <LinkButton href={`/app/studio?produit=${encodeURIComponent(product.id)}`} variant="outline" size="sm" className="h-10">
          Écrire mes scripts
        </LinkButton>
        <form action={setVideoGoalAction} className="ml-auto flex items-center gap-2 text-sm">
          <input type="hidden" name="produit" value={product.id} />
          <label htmlFor={`objectif-${product.id}`} className="text-muted">
            Objectif
          </label>
          <input
            id={`objectif-${product.id}`}
            name="objectif"
            type="number"
            min={1}
            max={200}
            defaultValue={progress.total}
            className="num h-10 w-16 rounded-xl border border-line bg-surface px-2 text-center"
          />
          <button type="submit" className="h-10 rounded-full px-3 font-semibold text-muted hover:bg-surface hover:text-fg">
            Changer
          </button>
        </form>
      </div>
    </li>
  );
}

export default async function MesProduitsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/mes-produits');
  const today = parisDate();
  const { rows, stats } = await loadMyProducts(getRepo(), profile, today);
  const declining = rows.filter((r) => r.declining);
  const weekDone = stats.thisWeek >= stats.weeklyGoal;

  return (
    <div>
      <PageHeader eyebrow="Suivre"
        title="Mes produits"
        description="Choisis peu de produits et publie beaucoup sur chacun. Objectif : 20 vidéos par produit."
      />
      {searchParams.ok === 'objectif' ? <Callout tone="gain" className="mb-6" title="Objectif de la semaine enregistré." /> : null}

      {rows.length === 0 ? (
        <EmptyState title="Tu ne suis encore aucun produit" action={<LinkButton href="/app/radar">Ouvrir le radar</LinkButton>}>
          Ouvre un produit du radar et appuie sur « Ajouter à mes produits » pour suivre tes vidéos ici.
        </EmptyState>
      ) : (
        <>
          {/* Grand écran : chiffres et objectif côte à côte, produits sur deux colonnes. */}
          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-stretch">
          <dl className="grid grid-cols-2 content-stretch gap-px overflow-hidden rounded-2xl border border-line bg-line text-center sm:grid-cols-4">
            {[
              { label: 'Produits suivis', value: formatInt(rows.length) },
              { label: 'Vidéos postées', value: formatInt(stats.totalPosted) },
              { label: stats.streak > 1 ? 'Jours d’affilée' : 'Jour d’affilée', value: formatInt(stats.streak), icon: stats.streak > 0 },
              { label: 'Cette semaine', value: `${formatInt(stats.thisWeek)} / ${stats.weeklyGoal}` },
            ].map((item) => (
              <div key={item.label} className="flex flex-col justify-center bg-raised px-2 py-3.5">
                <dd className="num flex items-center justify-center gap-1 text-2xl font-semibold">
                  {item.icon ? <Flame className="h-5 w-5 text-rose-ink" aria-hidden="true" /> : null}
                  {item.value}
                </dd>
                <dt className="text-xs text-muted">{item.label}</dt>
              </div>
            ))}
          </dl>

          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base">Objectif de la semaine</h2>
              <p className={cn('text-sm', weekDone ? 'font-semibold text-gain' : 'text-muted')}>
                {weekDone
                  ? 'Atteint, bravo.'
                  : `Encore ${plural(stats.weeklyGoal - stats.thisWeek, 'vidéo')} d’ici dimanche.`}
              </p>
            </div>
            <ProgressBar className="mt-3" value={stats.thisWeek} max={stats.weeklyGoal} label="Vidéos postées cette semaine" />
            <p className="mt-2 text-sm text-muted">
              {stats.streak > 0
                ? `Série en cours : ${plural(stats.streak, 'jour')} d’affilée avec au moins une vidéo postée.${stats.postedToday ? '' : ' Poste aujourd’hui pour la garder.'}`
                : 'Poste une vidéo aujourd’hui pour lancer ta série.'}
            </p>
            <form action={setWeeklyGoalAction} className="mt-3 flex flex-wrap items-end gap-2">
              <label htmlFor="objectif_semaine" className="text-sm font-semibold">
                Vidéos par semaine
                <Input
                  id="objectif_semaine"
                  name="objectif_semaine"
                  type="number"
                  min={1}
                  max={MAX_WEEKLY_GOAL}
                  defaultValue={stats.weeklyGoal}
                  className="num mt-1 h-10 w-24 text-center"
                />
              </label>
              <SubmitButton size="sm" variant="outline" className="h-10" pendingLabel="Enregistrement…">
                Changer l’objectif
              </SubmitButton>
            </form>
          </Card>
          </div>

          {declining.length ? (
            <Callout tone="warn" className="mb-6" title={`${plural(declining.length, 'produit suivi commence', 'produits suivis commencent')} à baisser`}>
              {declining.map((d) => displayName(d.product)).join(', ')}. Termine tes vidéos prévues rapidement : tu recevras aussi une alerte.
            </Callout>
          ) : null}
          <ul className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
            {rows.map((r) => (
              <Row key={r.saved.id} row={r} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
