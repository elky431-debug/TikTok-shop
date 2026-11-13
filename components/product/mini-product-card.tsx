import Link from 'next/link';
import type { ProductView } from '@/lib/radar';
import { formatEuros } from '@/lib/utils';
import { ProductImage } from './bits';
import { ScoreValue } from './score';

/** Petite carte (produits similaires, même boutique). */
export function MiniProductCard({ product }: { product: ProductView }) {
  return (
    <Link href={`/app/produit/${product.id}`} className="feature-card group flex h-full gap-3 p-3">
      <ProductImage src={product.image_url} fallback={product.image_fallback} alt="" className="w-14 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">{product.name}</p>
        <p className="num mt-1 text-xs">
          <span className="font-semibold">{formatEuros(product.price_cents)}</span>
          <span className="text-muted"> · </span>
          <span className="font-semibold text-gain">{formatEuros(product.commission_cents)} par vente</span>
        </p>
      </div>
      {product.score !== null ? <ScoreValue score={product.score} size="sm" showMax={false} className="shrink-0 self-start" /> : null}
    </Link>
  );
}
