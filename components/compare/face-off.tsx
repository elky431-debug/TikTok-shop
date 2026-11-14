'use client';

import { Check, Crown, Plus, RefreshCw, Sparkles, Star, X } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/manager/manager-ui';
import { ProductImage } from '@/components/product/product-image';
import { ScoreValue } from '@/components/product/score';
import { ButtonArrow, LinkButton } from '@/components/ui/button';
import type { CriterionResult } from '@/lib/radar/compare';
import { cn, formatEuros } from '@/lib/utils';

export interface FaceProduct {
  id: string;
  name: string;
  image: string;
  fallback: string;
  score: number | null;
  scoreLocked: boolean;
  priceCents: number;
  favorite: boolean;
}

export interface FaceRow extends CriterionResult {
  /** Valeur affichée de chaque produit (« 4,20 € », « 18 % », « — »). */
  display: string[];
}

const MAX = 4;

/**
 * Comparateur : deux produits face à face autour d'un grand « VS » animé (barres qui poussent de chaque côté, couronne
 * sur la valeur qui l'emporte), ou trois à quatre produits en cartes. Choix des produits par cases cliquables qui
 * ouvrent la liste des favoris et des produits suivis.
 */
export function FaceOff({
  products,
  rows,
  winner,
  wins,
  candidates,
}: {
  products: FaceProduct[];
  rows: FaceRow[];
  winner: number;
  wins: number[];
  candidates: FaceProduct[];
}) {
  const router = useRouter();
  const [slot, setSlot] = useState<number | null>(null);
  const ids = products.map((p) => p.id);

  function choose(id: string) {
    const next = [...ids];
    if (slot === null || slot >= next.length) next.push(id);
    else next[slot] = id;
    const unique = [...new Set(next)].slice(0, MAX);
    setSlot(null);
    router.push(`/app/comparer?ids=${unique.join(',')}`);
  }
  function remove(index: number) {
    const next = ids.filter((_, i) => i !== index);
    router.push(next.length ? `/app/comparer?ids=${next.join(',')}` : '/app/comparer?ids=');
  }

  const picker = (
    <Modal open={slot !== null} onClose={() => setSlot(null)} icon={<Star />} title="Choisis un produit" subtitle="Tes favoris et tes produits suivis">
      <ul className="grid grid-cols-2 gap-2 p-6 pt-4 sm:grid-cols-3">
        {candidates.map((c) => {
          const taken = ids.includes(c.id) && ids[slot ?? -1] !== c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                disabled={taken}
                onClick={() => choose(c.id)}
                className="group relative w-full rounded-2xl border border-line bg-bg p-2 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-cyan-ink/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ProductImage src={c.image} fallback={c.fallback} alt="" className="w-full rounded-xl" />
                <span className="mt-2 line-clamp-2 block text-xs font-semibold leading-snug">{c.name}</span>
                {c.favorite ? <Star className="absolute right-3 top-3 h-4 w-4 fill-current text-cyan-ink drop-shadow" aria-label="Favori" /> : null}
                {taken ? <Check className="absolute left-3 top-3 h-4 w-4 text-gain" aria-label="Déjà choisi" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );

  if (products.length < 2) {
    return (
      <>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
          {products[0] ? (
            <ProductSide product={products[0]} onChange={() => setSlot(0)} onRemove={() => remove(0)} />
          ) : (
            <EmptySlot onClick={() => setSlot(0)} />
          )}
          <Versus />
          <EmptySlot onClick={() => setSlot(products.length ? 1 : 0)} />
        </div>
        {picker}
      </>
    );
  }

  return (
    <>
      {products.length === 2 ? (
        <TwoUp products={products} rows={rows} winner={winner} onChange={setSlot} onRemove={remove} />
      ) : (
        <Grid products={products} rows={rows} winner={winner} wins={wins} onChange={setSlot} onRemove={remove} />
      )}
      <Verdict ids={ids} winner={products[winner]} />
      {products.length < MAX ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setSlot(products.length)}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-5 py-3 text-sm font-semibold text-muted transition-colors hover:border-cyan-ink/40 hover:text-fg"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter un produit
          </button>
        </div>
      ) : null}
      {picker}
    </>
  );
}

function Versus() {
  return (
    <motion.span
      className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[image:var(--gradient)] text-xl font-black italic tracking-tight text-on-gradient shadow-[0_0_40px_-6px_rgb(var(--cyan)/0.55)] sm:h-24 sm:w-24 sm:text-3xl"
      initial={{ scale: 0.3, rotate: -18, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.15 }}
      aria-label="contre"
    >
      <motion.span
        className="absolute inset-0 rounded-full border-2 border-cyan-ink/40"
        animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
        aria-hidden="true"
      />
      VS
    </motion.span>
  );
}

function EmptySlot({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-line-strong text-muted transition-colors hover:border-cyan-ink/50 hover:bg-cyan-ink/[0.04] hover:text-fg sm:aspect-[4/3]"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-ink/30 bg-cyan-ink/10 text-cyan-ink">
        <Plus className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold">Choisir un produit</span>
    </button>
  );
}

function SideActions({ onChange, onRemove, name }: { onChange: () => void; onRemove: () => void; name: string }) {
  return (
    <span className="absolute right-2 top-2 z-10 flex gap-1">
      <button
        type="button"
        onClick={onChange}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-bg/90 text-muted shadow-sm backdrop-blur hover:text-fg"
        aria-label={`Changer ${name}`}
        title="Changer"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-bg/90 text-muted shadow-sm backdrop-blur hover:text-rose-ink"
        aria-label={`Retirer ${name}`}
        title="Retirer"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

function ProductSide({
  product,
  onChange,
  onRemove,
  won,
  align = 'center',
}: {
  product: FaceProduct;
  onChange: () => void;
  onRemove: () => void;
  won?: boolean;
  align?: 'center';
}) {
  return (
    <motion.div
      className={cn('relative flex flex-col items-center text-center', align === 'center' && 'mx-auto w-full')}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <div className={cn('relative w-full max-w-[15rem] rounded-3xl p-1', won ? 'bg-[image:var(--gradient)]' : 'bg-line')}>
        <SideActions onChange={onChange} onRemove={onRemove} name={product.name} />
        <ProductImage src={product.image} fallback={product.fallback} alt="" className="w-full rounded-[1.25rem]" />
        {won ? (
          <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[image:var(--gradient)] px-3 py-1 text-xs font-bold text-on-gradient shadow-lg">
            <Crown className="h-3.5 w-3.5" aria-hidden="true" />
            Gagnant
          </span>
        ) : null}
      </div>
      <Link href={`/app/produit/${product.id}`} className="mt-3 line-clamp-2 text-base font-bold leading-snug tracking-tight hover:underline sm:text-lg">
        {product.name}
      </Link>
      <p className="num mt-0.5 text-xs text-muted">{formatEuros(product.priceCents)}</p>
      <ScoreValue score={product.score} locked={product.scoreLocked} size="lg" className="mt-2" />
    </motion.div>
  );
}

function TwoUp({
  products,
  rows,
  winner,
  onChange,
  onRemove,
}: {
  products: FaceProduct[];
  rows: FaceRow[];
  winner: number;
  onChange: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  const [a, b] = products;
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-8">
        <ProductSide product={a} won={winner === 0} onChange={() => onChange(0)} onRemove={() => onRemove(0)} />
        <span className="mt-16 sm:mt-24">
          <Versus />
        </span>
        <ProductSide product={b} won={winner === 1} onChange={() => onChange(1)} onRemove={() => onRemove(1)} />
      </div>
      <div className="mt-6 flex justify-around gap-4">
        {[0, 1].map((i) =>
          winner === i ? (
            <LinkButton key={i} href={`/app/studio?produit=${products[i].id}`} size="lg" className="w-full max-w-[15rem]">
              Écrire mes scripts
              <ButtonArrow />
            </LinkButton>
          ) : (
            <span key={i} className="w-full max-w-[15rem]" aria-hidden="true" />
          ),
        )}
      </div>

      <ol className="mt-10 space-y-2.5" aria-label="Critères">
        {rows.map((row, r) => (
          <li key={row.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
            {[0, 1].map((i) => {
              const won = row.winners.length === 1 && row.winners[0] === i;
              const cell = (
                <div key={i} className={cn('flex items-center gap-2', i === 0 ? 'flex-row-reverse text-right' : 'text-left', i === 1 && 'col-start-3')}>
                  <span
                    className={cn(
                      'num w-20 shrink-0 text-sm font-semibold sm:w-24 sm:text-base',
                      i === 0 ? 'text-right' : 'text-left',
                      won ? 'text-cyan-ink' : row.values[i] === null ? 'text-subtle' : 'text-fg',
                    )}
                  >
                    {won ? <Crown className={cn('mb-0.5 inline h-3.5 w-3.5', i === 0 ? 'mr-1' : 'mr-1')} aria-label="l’emporte" /> : null}
                    {row.display[i]}
                  </span>
                  <span className={cn('flex h-2.5 flex-1 overflow-hidden rounded-full bg-fg/[0.06]', i === 0 && 'justify-end')}>
                    <motion.span
                      className={cn('h-full rounded-full', won ? 'bg-[image:var(--gradient)]' : 'bg-fg/25')}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(row.bars[i] * 100)}%` }}
                      transition={{ duration: 0.7, delay: 0.25 + r * 0.06, ease: [0.2, 0.7, 0.2, 1] }}
                    />
                  </span>
                </div>
              );
              return cell;
            })}
            <span className="col-start-2 row-start-1 w-24 text-center text-[11px] font-semibold uppercase leading-tight tracking-wider text-muted sm:w-32 sm:text-xs">
              {row.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Grid({
  products,
  rows,
  winner,
  wins,
  onChange,
  onRemove,
}: {
  products: FaceProduct[];
  rows: FaceRow[];
  winner: number;
  wins: number[];
  onChange: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <ul className={cn('grid gap-4 sm:grid-cols-2', products.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
      {products.map((p, i) => (
        <motion.li
          key={p.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.08 }}
          className={cn('relative rounded-3xl p-[2px]', winner === i ? 'bg-[image:var(--gradient)]' : 'bg-line')}
        >
          <div className="flex h-full flex-col rounded-[1.4rem] bg-raised p-4">
            <div className="relative">
              <SideActions onChange={() => onChange(i)} onRemove={() => onRemove(i)} name={p.name} />
              <ProductImage src={p.image} fallback={p.fallback} alt="" className="w-full rounded-2xl" />
              {winner === i ? (
                <span className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[image:var(--gradient)] px-3 py-1 text-xs font-bold text-on-gradient shadow-lg">
                  <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                  Gagnant
                </span>
              ) : null}
            </div>
            <Link href={`/app/produit/${p.id}`} className="mt-5 line-clamp-2 font-bold leading-snug hover:underline">
              {p.name}
            </Link>
            <div className="mt-1 flex items-end justify-between gap-2">
              <ScoreValue score={p.score} locked={p.scoreLocked} size="md" showMax={false} />
              <span className="num flex items-center gap-1 text-xs font-semibold text-muted">
                <Crown className="h-3.5 w-3.5 text-cyan-ink" aria-hidden="true" />
                {wins[i]} critère{wins[i] > 1 ? 's' : ''}
              </span>
            </div>
            <ul className="mt-4 flex-1 space-y-2.5">
              {rows.map((row, r) => {
                const won = row.winners.includes(i);
                return (
                  <li key={row.id}>
                    <p className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-muted">{row.label}</span>
                      <span className={cn('num font-semibold', won ? 'text-cyan-ink' : row.values[i] === null ? 'text-subtle' : 'text-fg')}>
                        {won ? <Crown className="mb-0.5 mr-1 inline h-3 w-3" aria-label="l’emporte" /> : null}
                        {row.display[i]}
                      </span>
                    </p>
                    <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-fg/[0.06]">
                      <motion.span
                        className={cn('h-full rounded-full', won ? 'bg-[image:var(--gradient)]' : 'bg-fg/25')}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(row.bars[i] * 100)}%` }}
                        transition={{ duration: 0.6, delay: 0.2 + r * 0.05 }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
            {winner === i ? (
              <LinkButton href={`/app/studio?produit=${p.id}`} className="mt-5 w-full">
                Écrire mes scripts
                <ButtonArrow />
              </LinkButton>
            ) : null}
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

/** Verdict de l'IA en une phrase, chargé après l'affichage (la page ne l'attend pas). */
function Verdict({ ids, winner }: { ids: string[]; winner: FaceProduct }) {
  const key = ids.join(',');
  const [state, setState] = useState<{ key: string; sentence: string | null; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/comparer/verdict?ids=${encodeURIComponent(key)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { sentence?: string; error?: string }) => setState({ key, sentence: data.sentence ?? null, error: data.error }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, sentence: null, error: 'Verdict indisponible pour le moment.' });
      });
    return () => controller.abort();
  }, [key]);
  const current = state?.key === key ? state : null;
  return (
    <motion.div
      className="mt-10 rounded-2xl border border-line bg-gradient-to-br from-cyan-ink/[0.07] via-transparent to-rose-ink/[0.06] p-5 sm:p-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      aria-live="polite"
    >
      <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        <Sparkles className="h-3.5 w-3.5 text-cyan-ink" aria-hidden="true" />
        Verdict
      </p>
      {current ? (
        <p className="text-lg font-semibold leading-snug sm:text-xl">{current.sentence ?? current.error}</p>
      ) : (
        <div className="space-y-2" role="status" aria-label="Verdict en cours d’écriture">
          <div className="h-5 w-11/12 animate-skeleton rounded-md bg-fg/10" />
          <div className="h-5 w-2/3 animate-skeleton rounded-md bg-fg/10" />
        </div>
      )}
      <p className="sr-only">Produit qui l’emporte : {winner.name}</p>
    </motion.div>
  );
}
