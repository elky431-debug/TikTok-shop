import { ArrowDown, ArrowUp, Star } from 'lucide-react';
import Link from 'next/link';
import { saveRadarPrefsAction, toggleFavoriteAction } from '@/app/app/actions';
import type { ProductView } from '@/lib/radar';
import { defaultOrder, SORT_LABELS, type SortKey, type SortOrder } from '@/lib/radar/sort';
import { cn, formatCompact, formatEuros, formatGrowth } from '@/lib/utils';
import { ProductBadges } from './badges';
import { ProductImage } from './bits';

interface Column {
  key: SortKey;
  label: string;
  value: (p: ProductView) => React.ReactNode;
  /** Colonne affichée seulement si au moins un produit a la donnée. */
  has?: (p: ProductView) => boolean;
}

const COLUMNS: Column[] = [
  { key: 'score', label: 'Score', value: (p) => p.score ?? '—', has: (p) => p.score !== null },
  { key: 'pourtoi', label: 'Pour toi', value: (p) => p.personal_score ?? '—', has: (p) => p.personal_score !== null },
  { key: 'prix', label: 'Prix', value: (p) => formatEuros(p.price_cents) },
  { key: 'commission', label: 'Com.', value: (p) => `${Math.round(p.commission_rate * 100)} %` },
  { key: 'comeur', label: 'Par vente', value: (p) => <span className="text-gain">{formatEuros(p.commission_cents)}</span> },
  { key: 'ventes7', label: 'Ventes 7 j', value: (p) => (p.figures.sales_7d === null ? '—' : formatCompact(p.figures.sales_7d)), has: (p) => p.figures.sales_7d !== null },
  { key: 'ventes30', label: 'Ventes 30 j', value: (p) => (p.figures.sales_30d === null ? '—' : formatCompact(p.figures.sales_30d)), has: (p) => p.figures.sales_30d !== null },
  {
    key: 'croissance',
    label: 'Croissance',
    value: (p) => (p.figures.growth_7d === null ? <span className="text-muted">en mesure</span> : formatGrowth(p.figures.growth_7d)),
    has: (p) => p.figures.growth_7d !== null,
  },
  { key: 'affilies', label: 'Affiliés', value: (p) => (p.active_affiliates === null ? '—' : formatCompact(p.active_affiliates)), has: (p) => p.active_affiliates !== null },
  {
    key: 'note',
    label: 'Note',
    value: (p) =>
      p.figures.rating === null ? '—' : `${String(p.figures.rating).replace('.', ',')}${p.figures.review_count !== null ? ` (${formatCompact(p.figures.review_count)})` : ''}`,
    has: (p) => p.figures.rating !== null,
  },
];

function SortHeader({ column, sort, order, query }: { column: Pick<Column, 'key' | 'label'>; sort: SortKey; order: SortOrder; query: string }) {
  const active = sort === column.key;
  const next = active ? (order === 'asc' ? 'desc' : 'asc') : defaultOrder(column.key);
  const Arrow = order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined} className="whitespace-nowrap px-2 py-2 text-left font-semibold">
      <form action={saveRadarPrefsAction}>
        <input type="hidden" name="retour" value={query} />
        <button
          type="submit"
          name="tri"
          value={`${column.key}:${next}`}
          className={cn('inline-flex items-center gap-1 rounded-md py-1 text-xs hover:text-fg', active ? 'text-fg' : 'text-muted')}
          title={`Trier par ${SORT_LABELS[column.key].toLowerCase()}`}
        >
          {column.label}
          {active ? <Arrow className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        </button>
      </form>
    </th>
  );
}

/** Vue « liste » du radar : un tableau compact, tri sur n'importe quelle colonne (mémorisé). */
export function RadarTable({
  products,
  sort,
  order,
  query,
  showScore,
}: {
  products: Array<{ rank: number; product: ProductView }>;
  sort: SortKey;
  order: SortOrder;
  query: string;
  showScore: boolean;
}) {
  const columns = COLUMNS.filter((c) => (c.key === 'score' || c.key === 'pourtoi' ? showScore : true)).filter(
    (c) => !c.has || products.some(({ product }) => c.has!(product)),
  );
  const back = query ? `/app?${query}` : '/app';
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="num w-full min-w-[44rem] border-separate border-spacing-0 text-sm">
        <thead className="text-muted">
          <tr>
            <th scope="col" className="w-8 px-2 py-2 text-left text-xs font-semibold">
              <span className="sr-only">Rang</span>#
            </th>
            <SortHeader column={{ key: 'nom', label: 'Produit' }} sort={sort} order={order} query={query} />
            {columns.map((c) => (
              <SortHeader key={c.key} column={c} sort={sort} order={order} query={query} />
            ))}
            <th scope="col" className="px-2 py-2">
              <span className="sr-only">Favori</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map(({ rank, product }) => (
            <tr key={product.id} className="group">
              <td className="border-t border-line px-2 py-2.5 text-xs font-bold text-muted">{rank}</td>
              <td className="border-t border-line px-2 py-2.5">
                <div className="flex min-w-[14rem] items-center gap-2.5">
                  <ProductImage src={product.image_url} fallback={product.image_fallback} alt="" className="w-10 shrink-0" />
                  <div className="min-w-0">
                    <Link href={`/app/produit/${product.id}`} className="line-clamp-2 font-semibold leading-snug hover:underline">
                      {product.name}
                    </Link>
                    <ProductBadges badges={product.badges} className="mt-1" />
                  </div>
                </div>
              </td>
              {columns.map((c) => (
                <td key={c.key} className="whitespace-nowrap border-t border-line px-2 py-2.5">
                  {c.value(product)}
                </td>
              ))}
              <td className="border-t border-line px-2 py-2.5">
                <form action={toggleFavoriteAction}>
                  <input type="hidden" name="produit" value={product.id} />
                  <input type="hidden" name="retour" value={back} />
                  <button
                    type="submit"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-fg"
                    aria-pressed={product.favorite}
                    aria-label={product.favorite ? `Retirer « ${product.name.slice(0, 40)} » des favoris` : `Mettre « ${product.name.slice(0, 40)} » en favori`}
                  >
                    <Star className={cn('h-4 w-4', product.favorite && 'fill-current text-cyan-ink')} aria-hidden="true" />
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
