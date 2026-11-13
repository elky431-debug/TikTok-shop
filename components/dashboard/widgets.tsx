'use client';

import { Check, RefreshCw } from 'lucide-react';
import { animate, motion, useInView, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { refreshCreatorAction, toggleUpcomingVideoAction } from '@/app/app/dashboard-actions';
import { cn, formatDayMonth, formatEuros, formatInt } from '@/lib/utils';
import type { DayPoint, UpcomingVideo } from '@/lib/dashboard';

/* ------------------------------------------------------------------------------------------------------------------ */
/* Comptage des chiffres                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

const formatters = {
  euros: (n: number) => formatEuros(Math.round(n)),
  int: (n: number) => formatInt(Math.round(n)),
};

/**
 * Chiffre qui compte de 0 à sa valeur en 1,2 s (ease-out) la première fois qu'il apparaît. Le serveur rend la valeur
 * finale (même rendu des deux côtés, lisible sans JavaScript) ; le comptage part après l'hydratation. Fixe si
 * l'utilisateur a demandé moins d'animations.
 */
export function CountUp({ value, format = 'int', className }: { value: number; format?: keyof typeof formatters; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(value);
  const played = useRef(false);
  useEffect(() => {
    if (reduce || !inView || played.current) {
      if (reduce) setShown(value);
      return;
    }
    played.current = true;
    const controls = animate(0, value, { duration: 1.2, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    return () => controls.stop();
  }, [inView, reduce, value]);
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {/* Le lecteur d'écran lit la valeur finale, pas le comptage. */}
      <span aria-hidden="true">{formatters[format](shown)}</span>
      <span className="sr-only">{formatters[format](value)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Cartes en cascade                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

const cascade = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const cascadeItem = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };

// Toujours rendus avec Motion (même rendu serveur et navigateur) : `MotionConfig reducedMotion="user"` dans la coque
// coupe les déplacements quand l'utilisateur demande moins d'animations.
export function Cascade({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={cascade} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }}>
      {children}
    </motion.div>
  );
}

export function CascadeItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={cascadeItem}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Courbe des gains et des ventes                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const PERIODS = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
] as const;

/** Onglets d'EtSmart : texte blanc pour l'actif, trait en dégradé qui glisse (ressort 500 / 30). */
export function Tabs<T extends string | number>({
  value,
  onChange,
  options,
  label,
  id,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  label: string;
  id: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div role="tablist" aria-label={label} className="flex border-b border-line">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn('relative shrink-0 px-4 py-3 text-sm font-semibold transition-all', active ? 'text-fg' : 'text-muted hover:text-fg/80')}
          >
            {option.label}
            {active ? (
              <motion.span
                layoutId={`onglet-${id}`}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[image:var(--gradient)]"
                initial={false}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function GainsChart({ series }: { series: DayPoint[] }) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const reduce = useReducedMotion();
  const data = series.slice(-days).map((p) => ({ date: p.date, label: formatDayMonth(p.date), gains: p.gains_cents / 100, ventes: p.sales }));
  const total = data.reduce((s, p) => s + p.gains, 0);
  const sales = data.reduce((s, p) => s + p.ventes, 0);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs id="periode" label="Période du graphique" value={days} onChange={setDays} options={PERIODS.map((p) => ({ value: p.days, label: p.label }))} />
        <p className="text-xs text-muted">
          {formatEuros(Math.round(total * 100))} · {formatInt(sales)} ventes sur {days} jours
        </p>
      </div>
      <div
        className="mt-6 h-56 w-full sm:h-64"
        role="img"
        aria-label={`Gains et ventes saisis sur ${days} jours : ${formatEuros(Math.round(total * 100))} et ${formatInt(sales)} ventes.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="gainsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#25F4EE" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#25F4EE" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ventesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FE2C55" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#FE2C55" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" stroke="#8A8B91" fontSize={11} tickLine={false} minTickGap={24} />
            <YAxis yAxisId="g" stroke="#8A8B91" fontSize={11} tickLine={false} tickFormatter={(v: number) => `${v} €`} width={56} />
            <YAxis yAxisId="v" orientation="right" hide allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, color: '#fff' }}
              labelStyle={{ color: '#8A8B91' }}
              formatter={(value, name) => (name === 'gains' ? [`${Number(value).toFixed(2).replace('.', ',')} €`, 'Gains'] : [formatInt(Number(value)), 'Ventes'])}
            />
            <Area
              yAxisId="g"
              type="monotone"
              dataKey="gains"
              stroke="#25F4EE"
              strokeWidth={2}
              fill="url(#gainsGrad)"
              isAnimationActive={!reduce}
              animationDuration={1200}
            />
            <Area
              yAxisId="v"
              type="monotone"
              dataKey="ventes"
              stroke="#FE2C55"
              strokeWidth={1.5}
              fill="url(#ventesGrad)"
              isAnimationActive={!reduce}
              animationDuration={1200}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cyan" aria-hidden="true" /> Gains
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose" aria-hidden="true" /> Ventes
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Anneau d'objectif                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

export function ProgressRing({ ratio, size = 132, children, label }: { ratio: number; size?: number; children?: ReactNode; label: string }) {
  const reduce = useReducedMotion();
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="anneau" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#25F4EE" />
            <stop offset="100%" stopColor="#FE2C55" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--fg) / 0.1)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#anneau)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c * (1 - clamped) }}
          viewport={{ once: true }}
          transition={{ duration: reduce ? 0 : 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* À tourner cette semaine                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

export function UpcomingList({ items }: { items: UpcomingVideo[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (item: UpcomingVideo) => {
    const key = `${item.productId}-${item.n}`;
    const next = !done[key];
    setDone((d) => ({ ...d, [key]: next }));
    setError(null);
    start(async () => {
      const result = await toggleUpcomingVideoAction(item.productId, item.n, next);
      if (!result.ok) {
        setDone((d) => ({ ...d, [key]: !next }));
        setError(result.message ?? 'Action impossible. Réessaie.');
        return;
      }
      router.refresh();
    });
  };
  return (
    <>
      <ul className="space-y-2">
        {items.map((item) => {
          const key = `${item.productId}-${item.n}`;
          const checked = Boolean(done[key]);
          return (
            <li key={key} className="flex items-center gap-3 rounded-xl border border-line bg-bg px-4 py-3 transition-colors hover:border-line-strong">
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={pending}
                onClick={() => toggle(item)}
                aria-label={`Vidéo n°${item.n} sur ${item.productName} : ${checked ? 'postée' : 'à tourner'}`}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all active:scale-95',
                  checked ? 'border-cyan-ink bg-cyan-ink text-bg' : 'border-fg/35 hover:border-cyan-ink',
                )}
              >
                {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : null}
              </button>
              <span className={cn('min-w-0 flex-1 text-sm', checked ? 'text-muted line-through' : 'text-fg')}>
                <span className="block truncate font-medium">
                  Vidéo n°{item.n} · {item.productName}
                </span>
                <span className={cn('text-xs', item.overdue && !checked ? 'text-warn' : 'text-muted')}>
                  {item.date ? `${item.overdue ? 'Prévue le' : 'Le'} ${formatDayMonth(item.date)}` : 'Pas encore dans le calendrier'}
                </span>
              </span>
              <Link
                href={`/app/mes-produits/${encodeURIComponent(item.productId)}`}
                className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-cyan-ink transition-all hover:bg-cyan-ink/10"
              >
                Ouvrir
              </Link>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="mt-3 text-sm font-medium text-rose-ink" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Profil TikTok : relevé du jour                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Lance le relevé du profil à l'ouverture si le serveur l'autorise (une fois par jour), sans ralentir la page ;
 * bouton « Mettre à jour » sinon. La règle est revérifiée côté serveur.
 */
export function CreatorRefresh({ auto, canRefresh }: { auto: boolean; canRefresh: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);
  const run = () =>
    start(async () => {
      const result = await refreshCreatorAction();
      setMessage(result.message);
      router.refresh();
    });
  useEffect(() => {
    if (auto && !started.current) {
      started.current = true;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending || !canRefresh}
        title={canRefresh ? undefined : 'Un relevé par jour au plus'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-semibold text-muted transition-all hover:border-cyan-ink/45 hover:text-cyan-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} aria-hidden="true" />
        {pending ? 'Mise à jour…' : 'Mettre à jour'}
      </button>
      {message ? (
        <span className="text-xs text-muted" role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}
