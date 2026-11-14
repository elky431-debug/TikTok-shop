import { BookmarkCheck, Lock, Star, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ProductView } from '@/lib/radar';
import { nicheShort } from '@/lib/niches';
import { cn, formatCompact, formatEuros } from '@/lib/utils';
import { ProductBadges, WhyNowLine } from './badges';
import { ProductImage, TrendBadge } from './bits';
import { ScoreValue } from './score';
import { Sparkline } from './sparkline';

export function trendTone(trend: ProductView['trend']): 'up' | 'down' | 'flat' {
  if (trend === 'explose' || trend === 'monte') return 'up';
  if (trend === 'baisse') return 'down';
  return 'flat';
}

function Meta({ product, compact = false }: { product: ProductView; compact?: boolean }) {
  if (compact) {
    return (
      <p className="num mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
        <span className="font-semibold">{formatEuros(product.price_cents)}</span>
        <span className="whitespace-nowrap font-semibold text-gain">{formatEuros(product.commission_cents)}&nbsp;/ vente</span>
      </p>
    );
  }
  return (
    <p className="num mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <span className="font-semibold">{formatEuros(product.price_cents)}</span>
      <span className="text-subtle" aria-hidden="true">
        ·
      </span>
      <span className="whitespace-nowrap font-semibold text-gain">{formatEuros(product.commission_cents)}&nbsp;par vente</span>
      <span className="text-muted">({Math.round(product.commission_rate * 100)}&nbsp;%)</span>
    </p>
  );
}

function Signals({ product }: { product: ProductView }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <TrendBadge trend={product.trend} growth={product.growth_7d} measured={product.growth_known} />
      {product.active_affiliates !== null ? (
        <span className="num inline-flex items-center gap-1 text-xs text-muted">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {formatCompact(product.active_affiliates)} affiliés
        </span>
      ) : null}
      <ProductBadges badges={product.badges} trend={product.trend} growthKnown={product.growth_known} />
      {product.saved ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg">
          <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Suivi
        </span>
      ) : null}
      {product.favorite ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg">
          <Star className="h-3.5 w-3.5" aria-hidden="true" />
          Favori
        </span>
      ) : null}
    </div>
  );
}

/** « Pour toi 72 » à côté du score général (plans qui montrent le score). */
export function PersonalScore({ product, className }: { product: ProductView; className?: string }) {
  if (product.personal_score === null || product.score === null) return null;
  return (
    <span className={cn('num whitespace-nowrap text-xs font-semibold text-muted', className)}>
      Pour toi <span className="text-fg">{product.personal_score}</span>
    </span>
  );
}

/**
 * Lien de fond qui couvre toute la carte (ouvre la fiche) : le contenu passe au-dessus sans capter les clics, sauf
 * l'action (« Lancer ce produit »), cliquable à part.
 */
function CardLink({ product, className }: { product: ProductView; className?: string }) {
  return (
    <Link
      href={`/app/produit/${product.id}`}
      aria-label={`Ouvrir la fiche de ${product.name}`}
      className={cn('absolute inset-0 z-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan', className)}
    />
  );
}

/** Produit n°1 du jour : mis en avant, plus grand. */
export function FeaturedProductCard({ product, action }: { product: ProductView; action?: ReactNode }) {
  return (
    <div className="group gradient-border relative block rounded-2xl bg-raised p-4 shadow-[0_0_60px_-24px_rgba(37,244,238,0.35)] transition-transform duration-200 hover:-translate-y-0.5 sm:p-5">
      <CardLink product={product} className="rounded-2xl" />
      <div className="pointer-events-none relative">
        <p className="eyebrow">N°1 dans tes niches aujourd’hui</p>
        <div className="mt-3 flex gap-4">
          <ProductImage src={product.image_url} fallback={product.image_fallback} alt="" className="w-24 sm:w-32" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted">{nicheShort(product.niche)}</p>
            <h2 className="mt-0.5 line-clamp-3 text-lg font-semibold leading-snug group-hover:underline group-hover:underline-offset-4 sm:text-xl">
              {product.name}
            </h2>
            <Meta product={product} />
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between gap-4 border-t border-line pt-4">
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Score d’opportunité</p>
            <ScoreValue score={product.score} size="lg" />
            <PersonalScore product={product} className="mt-1 block" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Sparkline values={product.sales_7d} width={132} height={44} tone={trendTone(product.trend)} />
            <Signals product={product} />
          </div>
        </div>
        <WhyNowLine whyNow={product.why_now} className="mt-3" withLabel />
        {product.breakdown ? <p className="mt-2 text-sm text-muted">{product.breakdown.summary}</p> : null}
      </div>
      {action ? <div className="relative z-10 mt-4 w-fit">{action}</div> : null}
    </div>
  );
}

/** Carte compacte d'un produit du radar. */
export function ProductCard({ product, rank, action }: { product: ProductView; rank: number; action?: ReactNode }) {
  return (
    <div className="feature-card group relative flex h-full gap-3 p-3 sm:p-3.5">
      <CardLink product={product} className="rounded-[inherit]" />
      <div className="pointer-events-none relative">
        <ProductImage src={product.image_url} fallback={product.image_fallback} alt="" className="w-[4.5rem]" />
        <span className="num absolute -left-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-fg px-1.5 text-xs font-bold text-bg">
          {rank}
        </span>
      </div>
      <div className="pointer-events-none relative min-w-0 flex-1">
        <h3 className="line-clamp-2 font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">{product.name}</h3>
        <Meta product={product} compact />
        <Signals product={product} />
        <WhyNowLine whyNow={product.why_now} className="mt-2" compact />
        {/* Toujours visible sur téléphone ; au survol (ou au clavier) sur ordinateur. */}
        {action ? (
          <div className="pointer-events-auto relative z-10 mt-2.5 w-fit transition-opacity lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100">
            {action}
          </div>
        ) : null}
      </div>
      <div className="pointer-events-none relative flex shrink-0 flex-col items-end justify-between gap-1">
        <ScoreValue score={product.score} size="sm" showMax={false} />
        <PersonalScore product={product} />
        <Sparkline values={product.sales_7d} width={72} height={26} tone={trendTone(product.trend)} />
      </div>
    </div>
  );
}

/** Produit réservé au Pro : aucune donnée réelle n'est envoyée au navigateur. */
export function LockedProductCard({ rank, niche, className }: { rank: number; niche: string; className?: string }) {
  return (
    <div className={cn('relative flex gap-3 rounded-2xl border border-line bg-raised/60 p-3 sm:p-3.5', className)} aria-hidden="true">
      <div className="relative">
        <div className="aspect-square w-[4.5rem] rounded-xl bg-line" />
        <span className="num absolute -left-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-bg px-1.5 text-xs font-bold text-muted">
          {rank}
        </span>
      </div>
      <div className="min-w-0 flex-1 select-none blur-[5px]">
        <p className="font-semibold">Produit {nicheShort(niche).toLowerCase()} réservé</p>
        <p className="mt-1 text-sm">00,00 € · 0,00 € par vente</p>
        <p className="mt-2 text-xs">Monte · 000 affiliés</p>
      </div>
      <div className="flex shrink-0 items-center">
        <Lock className="h-4 w-4 text-subtle" />
      </div>
    </div>
  );
}
