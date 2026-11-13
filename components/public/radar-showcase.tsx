'use client';

import { ProductImage } from '@/components/product/product-image';
import { Clapperboard, Pause, Play, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ShowcaseProduct {
  id: string;
  name: string;
  niche: string;
  imageUrl: string;
  /** Visuel SVG de repli. */
  imageFallback: string;
  price: string;
  commission: string;
  trend: string;
  rising: boolean;
  /** null = la source ne le dit pas : la ligne est masquée. */
  affiliates: string | null;
  score: number;
  sales: number[];
  hook: string;
}

function curve(values: number[], width: number, height: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 6 - ((v - min) / range) * (height - 14)]);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return { line, area: `${line} L${width},${height} L0,${height} Z` };
}

/**
 * Aperçu du radar dans le héros : les produits du jour défilent un par un toutes les 3 s,
 * et le score fait son effet de décalage cyan / rose à chaque changement.
 * Pause au survol, au focus, avec le bouton dédié, et pas de défilement si « réduire les animations ».
 */
export function RadarShowcase({ products, demoData }: { products: ShowcaseProduct[]; demoData: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (paused || hovered || reduced || products.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % products.length), 3000);
    return () => window.clearInterval(timer);
  }, [paused, hovered, reduced, products.length]);

  const active = products[index];
  if (!active) return null;
  const { line, area } = curve(active.sales, 320, 96);
  const autoplay = !paused && !reduced;

  return (
    <section
      aria-label="Aperçu du radar du jour"
      className="gradient-border relative mx-auto mt-16 max-w-4xl rounded-3xl bg-raised p-4 text-left shadow-[0_0_80px_-24px_rgb(var(--cyan)/0.35)] sm:p-6"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted">
          Radar · ce matin{demoData ? <span className="font-normal text-subtle"> · produits fictifs</span> : null}
        </p>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:text-fg"
        >
          {autoplay ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
          {/* Le nom lu commence par le mot affiché (WCAG 2.5.3, « label in name »). */}
          {autoplay ? 'Pause' : 'Lecture'}
          <span className="sr-only">{autoplay ? ' du défilement des produits' : ' du défilement des produits'}</span>
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1.35fr] md:gap-6">
        {/* Classement du jour */}
        <ol className="hidden space-y-1.5 md:block" aria-label="Classement du jour">
          {products.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  i === index ? 'border-cyan-ink/30 bg-cyan-ink/[0.06]' : 'border-transparent hover:bg-surface',
                )}
              >
                <span className="num w-5 text-sm font-bold text-subtle">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{p.name}</span>
                  <span className="block text-xs text-muted">{p.niche}</span>
                </span>
                <span className="num text-sm font-bold text-fg">{p.score}</span>
              </button>
            </li>
          ))}
        </ol>

        {/* Produit en cours */}
        <div className="min-w-0 rounded-2xl border border-line bg-bg/40 p-4" aria-live={autoplay ? 'off' : 'polite'}>
          <div className="flex gap-3">
            <ProductImage key={active.id} src={active.imageUrl} fallback={active.imageFallback} alt="" className="h-14 w-14 sm:h-16 sm:w-16" />
            <div className="min-w-0">
              <p className="text-xs text-muted">
                N°{index + 1} · {active.niche}
              </p>
              <p className="truncate font-semibold text-fg">{active.name}</p>
              <p className="num mt-0.5 text-sm">
                <span className="font-semibold text-fg">{active.price}</span>
                <span className="text-subtle"> · </span>
                <span className="font-semibold text-gain">{active.commission} par vente</span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted">Score d’opportunité</p>
              <p key={active.id} className="num split-glow animate-score-glitch mt-1 text-6xl font-bold leading-none tracking-tight text-fg">
                {active.score}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 text-xs">
              <span className={cn('rounded-full px-2 py-0.5 font-semibold', active.rising ? 'bg-cyan-ink/10 text-cyan-ink' : 'bg-surface text-muted')}>
                {active.trend}
              </span>
              {active.affiliates !== null ? (
                <span className="num inline-flex items-center gap-1 text-muted">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" /> {active.affiliates} affiliés
                </span>
              ) : null}
            </div>
          </div>

          <svg viewBox="0 0 320 96" preserveAspectRatio="none" className="mt-3 h-20 w-full" aria-hidden="true">
            <defs>
              <linearGradient id="showcase-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#25F4EE" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#25F4EE" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#showcase-fill)" />
            <path d={line} fill="none" stroke="#25F4EE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-right text-[11px] text-subtle">Ventes estimées, 14 derniers jours</p>

          <div className="mt-3 rounded-xl bg-surface p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" /> Accroche écrite pour toi
            </p>
            <p className="mt-1 font-semibold leading-snug text-fg">«&nbsp;{active.hook}&nbsp;»</p>
          </div>
        </div>
      </div>

      {/* Points de progression (mobile) */}
      <div className="mt-4 flex justify-center gap-1.5 md:hidden">
        {products.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Produit n°${i + 1} : ${p.name}`}
            aria-current={i === index ? 'true' : undefined}
            className="flex h-6 w-6 items-center justify-center"
          >
            <span className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-cyan-ink' : 'w-1.5 bg-fg/25')} />
          </button>
        ))}
      </div>
    </section>
  );
}
