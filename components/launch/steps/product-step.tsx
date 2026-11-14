import Link from 'next/link';
import { ProductImage } from '@/components/product/product-image';
import { ScoreValue } from '@/components/product/score';
import { nicheLabel } from '@/lib/niches';
import { getPlan } from '@/lib/plans';
import { fallbackImageUrl } from '@/lib/product-image';
import { displayName } from '@/lib/product-name';
import { formatEuros, formatPercent } from '@/lib/utils';
import type { LaunchPageData } from '@/lib/v2/launch-view';
import type { Profile } from '@/lib/db/types';
import { StepFrame, StepNav } from '../step-frame';

/** Étape 1 (déjà cochée quand on arrive d'une fiche) : le produit choisi, avec ses chiffres clés. */
export function ProductStep({ data, profile }: { data: LaunchPageData; profile: Pick<Profile, 'plan'> }) {
  const { launch, product } = data;
  return (
    <StepFrame step="produit" sentence="C’est le produit de ce lancement : toutes les étapes qui suivent sont faites pour lui.">
      <div className="grid grid-cols-1 items-start gap-6 rounded-2xl border border-line bg-raised p-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:p-6 lg:grid-cols-[12rem_minmax(0,1fr)_auto]">
        <ProductImage
          src={product?.image_url ?? ''}
          fallback={fallbackImageUrl(launch.data.product_id, product?.niche ?? 'maison')}
          alt=""
          className="w-32 rounded-2xl sm:w-full"
        />
        <div className="min-w-0">
          <p className="text-xl font-bold leading-snug">{product ? displayName(product) : launch.data.product_name}</p>
          {product ? <p className="mt-1 text-sm text-muted">{nicheLabel(product.niche)}</p> : null}
          {product ? (
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <dt className="text-xs text-muted">Prix</dt>
                <dd className="num text-lg font-semibold">{formatEuros(product.price_cents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Ta commission</dt>
                <dd className="num text-lg font-semibold text-gain">
                  {formatEuros(data.commissionPerSaleCents)} <span className="text-sm font-medium text-muted">par vente ({formatPercent(product.commission_rate)})</span>
                </dd>
              </div>
            </dl>
          ) : null}
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link href={`/app/produit/${encodeURIComponent(launch.data.product_id)}`} className="font-semibold text-cyan-ink underline underline-offset-2">
              Voir la fiche
            </Link>
            <Link href="/app/lancer/nouveau" className="font-semibold text-muted underline underline-offset-2 hover:text-fg">
              Lancer un autre produit
            </Link>
          </p>
        </div>
        {product ? <ScoreValue score={product.latest_score} locked={!getPlan(profile.plan).showScore} size="lg" /> : null}
      </div>
      <StepNav id={launch.id} step="produit" />
    </StepFrame>
  );
}
