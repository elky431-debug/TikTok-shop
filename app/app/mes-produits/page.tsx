import type { Metadata } from 'next';
import { Minus, Plus, TrendingDown, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { fallbackImageUrl } from '@/lib/product-image';
import { ProductImage, TrendBadge } from '@/components/product/bits';
import { LinkButton } from '@/components/ui/button';
import { Callout, EmptyState, PageHeader, ProgressBar } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import type { Product, SavedProduct } from '@/lib/db/types';
import { commissionPerSale } from '@/lib/score';
import { cn, formatEuros, formatInt, plural } from '@/lib/utils';
import { changeVideoCountAction, removeSavedProductAction, setVideoGoalAction } from './actions';

export const metadata: Metadata = { title: 'Mes produits' };

/** Un produit suivi « commence à baisser » : tendance en baisse ou −15 % sur 7 jours. */
function isDeclining(product: Product): boolean {
  return product.trend === 'baisse' || product.growth_7d <= -0.15;
}

function Row({ product, saved }: { product: Product; saved: SavedProduct }) {
  const done = saved.videos_posted >= saved.video_goal;
  const left = Math.max(0, saved.video_goal - saved.videos_posted);
  const declining = isDeclining(product);
  return (
    <li className={cn('rounded-2xl border p-4 sm:p-5', declining ? 'border-warn/40' : 'border-line')}>
      <div className="flex gap-3.5">
        <Link href={`/app/produit/${product.id}`} className="shrink-0" tabIndex={-1} aria-hidden="true">
          <ProductImage src={product.image_url} fallback={fallbackImageUrl(product.id, product.niche)} alt="" className="w-16" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/app/produit/${product.id}`} className="font-semibold leading-snug hover:underline hover:underline-offset-4">
            {product.name}
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
            aria-label={`Retirer ${product.name} de mes produits`}
            title="Retirer de mes produits"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>

      {declining ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm">
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          <span>
            Ce produit commence à baisser. Publie vite les vidéos prévues, puis cherche le suivant dans le radar.
          </span>
        </p>
      ) : null}

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-semibold">
            <span className="num">{formatInt(saved.videos_posted)}</span> / <span className="num">{saved.video_goal}</span> vidéos
          </span>
          <span className={cn('text-muted', done && 'font-semibold text-gain')}>
            {done ? 'Objectif atteint' : `Encore ${plural(left, 'vidéo')}`}
          </span>
        </div>
        <ProgressBar value={saved.videos_posted} max={saved.video_goal} label={`Vidéos postées sur ${product.name}`} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form action={changeVideoCountAction}>
          <input type="hidden" name="produit" value={product.id} />
          <input type="hidden" name="delta" value="1" />
          <button type="submit" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-fg px-4 text-sm font-semibold text-bg hover:bg-fg/85">
            <Plus className="h-4 w-4" aria-hidden="true" />
            J’ai posté une vidéo
          </button>
        </form>
        <form action={changeVideoCountAction}>
          <input type="hidden" name="produit" value={product.id} />
          <input type="hidden" name="delta" value="-1" />
          <button
            type="submit"
            disabled={saved.videos_posted === 0}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line hover:bg-surface disabled:opacity-40"
            aria-label="Retirer une vidéo du compteur"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
        <LinkButton href={`/app/studio?produit=${product.id}`} variant="outline" size="sm" className="h-10">
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
            defaultValue={saved.video_goal}
            className="num h-10 w-16 rounded-xl border border-line bg-raised px-2 text-center"
          />
          <button type="submit" className="h-10 rounded-full px-3 font-semibold text-muted hover:bg-surface hover:text-fg">
            Changer
          </button>
        </form>
      </div>
    </li>
  );
}

export default async function MesProduitsPage() {
  const { profile } = await requireOnboardedViewer('/app/mes-produits');
  const repo = getRepo();
  const saved = await repo.listSavedProducts(profile.id);
  const products = new Map((await repo.getProducts(saved.map((s) => s.product_id))).map((p) => [p.id, p]));
  const rows = saved.flatMap((s) => {
    const product = products.get(s.product_id);
    return product ? [{ saved: s, product }] : [];
  });
  const totalVideos = rows.reduce((sum, r) => sum + r.saved.videos_posted, 0);
  const declining = rows.filter((r) => isDeclining(r.product));
  const reached = rows.filter((r) => r.saved.videos_posted >= r.saved.video_goal).length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Mes produits"
        description="Choisis peu de produits et publie beaucoup sur chacun. Objectif : 20 vidéos par produit."
      />

      {rows.length === 0 ? (
        <EmptyState title="Tu ne suis encore aucun produit" action={<LinkButton href="/app">Ouvrir le radar</LinkButton>}>
          Ouvre un produit du radar et appuie sur « Ajouter à mes produits » pour suivre tes vidéos ici.
        </EmptyState>
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line text-center">
            {[
              ['Produits suivis', rows.length],
              ['Vidéos postées', totalVideos],
              ['Objectifs atteints', reached],
            ].map(([label, value]) => (
              <div key={label} className="bg-raised px-2 py-3.5">
                <dd className="num text-2xl font-semibold">{formatInt(Number(value))}</dd>
                <dt className="text-xs text-muted">{label}</dt>
              </div>
            ))}
          </dl>
          {declining.length ? (
            <Callout tone="warn" className="mb-6" title={`${plural(declining.length, 'produit suivi commence', 'produits suivis commencent')} à baisser`}>
              {declining.map((d) => d.product.name).join(', ')}. Termine tes vidéos prévues rapidement.
            </Callout>
          ) : null}
          <ul className="space-y-3">
            {rows.map((r) => (
              <Row key={r.saved.id} product={r.product} saved={r.saved} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
