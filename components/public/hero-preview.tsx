'use client';

import { Clapperboard, Gift, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface HeroPreviewProps {
  name: string;
  niche: string;
  imageUrl: string;
  price: string;
  commission: string;
  affiliates: string;
  /** Tendance et croissance, ex. « Explose +56 % ». */
  trend: string;
  score: number;
  sales: number[];
  hook: string;
  freeSample: boolean;
  demoData: boolean;
}

function curve(values: number[], width: number, height: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 6 - ((v - min) / range) * (height - 12)]);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return { line, area };
}

/**
 * La seule animation orchestrée du site : au chargement de l'accueil, la courbe se trace,
 * le score monte, puis l'accroche s'écrit. Avec « réduire les animations », tout est affiché d'emblée.
 */
export function HeroPreview(props: HeroPreviewProps) {
  const [reduced, setReduced] = useState(false);
  const [started, setStarted] = useState(false);
  const [score, setScore] = useState(0);
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduced(prefersReduced);
    if (prefersReduced) {
      setScore(props.score);
      setTyped(props.hook.length);
      setStarted(true);
      return;
    }
    setStarted(true);
    let frame = 0;
    const start = performance.now() + 500;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 900));
      setScore(Math.round(props.score * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    let typing: number | undefined;
    const delay = window.setTimeout(() => {
      typing = window.setInterval(() => {
        setTyped((n) => {
          if (n >= props.hook.length) {
            window.clearInterval(typing);
            return n;
          }
          return n + 1;
        });
      }, 32);
    }, 1500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(delay);
      if (typing) window.clearInterval(typing);
    };
  }, [props.score, props.hook]);

  const { line, area } = curve(props.sales, 300, 92);
  const done = typed >= props.hook.length;

  return (
    <div
      className={cn(
        'relative mx-auto w-full max-w-[25rem] rounded-[1.75rem] border border-line bg-raised p-4 shadow-[0_24px_60px_-28px_rgba(22,24,35,0.35)] sm:p-5 lg:max-w-[26rem]',
        !reduced && 'animate-fade-up',
      )}
      aria-label={`Aperçu du radar : ${props.name}, score ${props.score} sur 100, accroche « ${props.hook} »`}
      role="img"
    >
      <div className="flex items-center justify-between text-xs font-semibold text-muted" aria-hidden="true">
        <span>Radar · ce matin 4 h 00</span>
        <span className="rounded-full bg-rose-soft px-2 py-0.5 text-rose-ink">N°1 en {props.niche.toLowerCase()}</span>
      </div>

      <div className="mt-3 flex gap-3 sm:mt-4" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-surface" />
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{props.name}</p>
          <p className="num mt-1 text-sm">
            <span className="font-semibold">{props.price}</span>
            <span className="text-subtle"> · </span>
            <span className="font-semibold text-gain">{props.commission} par vente</span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 sm:mt-4" aria-hidden="true">
        <div>
          <p className="text-xs font-medium text-muted">Score d’opportunité</p>
          <p className="num split-glow mt-1 text-5xl font-bold leading-none tracking-tight sm:text-6xl">{score}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-xs">
          <span className="rounded-full bg-cyan-soft px-2 py-0.5 font-semibold text-cyan-ink">{props.trend}</span>
          <span className="num inline-flex items-center gap-1 text-muted">
            <Users className="h-3.5 w-3.5" /> {props.affiliates} affiliés
          </span>
          {props.freeSample ? (
            <span className="inline-flex items-center gap-1 font-semibold text-cyan-ink">
              <Gift className="h-3.5 w-3.5" /> Échantillon gratuit
            </span>
          ) : null}
        </div>
      </div>

      <svg viewBox="0 0 300 92" className="mt-2 h-16 w-full text-cyan-ink sm:mt-3 sm:h-24" aria-hidden="true" preserveAspectRatio="none">
        <path d={area} fill="currentColor" fillOpacity="0.1" className={cn(!reduced && 'transition-opacity duration-700', started ? 'opacity-100' : 'opacity-0')} />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: started ? 0 : 1,
            transition: reduced ? 'none' : 'stroke-dashoffset 1100ms cubic-bezier(.3,.7,.2,1) 200ms',
          }}
        />
      </svg>
      <p className="-mt-1 text-right text-[0.7rem] text-muted" aria-hidden="true">
        Ventes estimées, 14 derniers jours
      </p>

      <div className="mt-3 rounded-2xl bg-surface p-3 sm:mt-4 sm:p-3.5" aria-hidden="true">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Clapperboard className="h-3.5 w-3.5" /> Accroche écrite pour toi
        </p>
        <p className="mt-1 min-h-[3rem] text-base font-semibold leading-snug sm:mt-1.5 sm:min-h-[3.25rem] sm:text-lg">
          «&nbsp;{props.hook.slice(0, typed)}
          <span className={cn('ml-0.5 inline-block h-5 w-0.5 translate-y-0.5 bg-rose', done ? 'opacity-0' : 'animate-pulse')} />
          {done ? <>&nbsp;»</> : null}
        </p>
      </div>
      {props.demoData ? (
        <p className="mt-3 text-center text-[0.7rem] text-muted" aria-hidden="true">
          Produit fictif, données de démonstration
        </p>
      ) : null}
    </div>
  );
}
