import { TrendingDown } from 'lucide-react';
import Link from 'next/link';
import type { Product } from '@/lib/db/types';
import { nicheShort } from '@/lib/niches';
import { declineSentence } from '@/lib/v2/decline';

/** Encart « ce produit commence à baisser », avec les remplaçants de la même niche (plans payants). */
export function DeclineCallout({
  product,
  replacements,
  paid,
  className,
}: {
  product: Product;
  replacements: Product[];
  paid: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-warn/40 bg-warn-soft p-4 text-sm ${className ?? ''}`}>
      <p className="flex items-start gap-2 font-semibold">
        <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
        <span>
          {product.name} commence à baisser. <span className="font-normal text-fg/85">{declineSentence(product)}</span>
        </span>
      </p>
      <p className="mt-1 text-fg/85">Publie vite les vidéos déjà tournées, puis passe au suivant.</p>
      {paid && replacements.length ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Mieux notés en {nicheShort(product.niche).toLowerCase()}</p>
          <ul className="mt-2 space-y-1.5">
            {replacements.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/produit/${encodeURIComponent(r.id)}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-bg/40 px-3 py-2 hover:bg-bg/70"
                >
                  <span className="line-clamp-1 font-medium">{r.name}</span>
                  <span className="num shrink-0 text-xs font-semibold text-cyan-ink">score {r.latest_score}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2">
          <Link href="/app" className="font-semibold underline underline-offset-4">
            Chercher le suivant dans le radar
          </Link>
        </p>
      )}
    </div>
  );
}
