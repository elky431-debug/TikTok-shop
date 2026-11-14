'use client';

import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { tooltipStyle, useChartColors } from '@/components/charts/colors';
import { KpiCard, panelClass, Pills } from '@/components/manager/manager-ui';
import { LinkButton } from '@/components/ui/button';
import { managerKpis, type ManagerData, type StatsRange } from '@/lib/v2/manager';
import { cn, formatEuros, formatInt } from '@/lib/utils';

const RANGES: Array<{ id: StatsRange; label: string }> = [
  { id: '7d', label: '7 jours' },
  { id: '30d', label: '30 jours' },
  { id: 'month', label: 'Par mois' },
  { id: 'all', label: 'Depuis le début' },
];

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const SHORT_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const shiftMonth = (month: string, delta: number) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1)).toISOString().slice(0, 7);
const dayLabel = (d: string) => `${Number(d.slice(8, 10))} ${SHORT_MONTHS[Number(d.slice(5, 7)) - 1]}`;

interface Point {
  label: string;
  commissions: number;
  ventes: number;
}

/** Commissions et ventes de la période : un point par jour, ou par mois depuis le début. */
export function periodSeries(data: Pick<ManagerData, 'earnings' | 'videos' | 'today' | 'canEarnings'>, range: StatsRange, month: string): Point[] {
  const salesFromEarnings = data.canEarnings && data.earnings.some((e) => e.sales);
  const add = (map: Map<string, Point>, key: string, cents: number, sales: number) => {
    const point = map.get(key);
    if (!point) return;
    point.commissions = Math.round(point.commissions * 100 + cents) / 100;
    point.ventes += sales;
  };
  const map = new Map<string, Point>();
  if (range === 'all') {
    const dates = [...data.earnings.map((e) => e.date), ...data.videos.map((v) => v.postedAt).filter((d): d is string => Boolean(d))].sort();
    let cursor = (dates[0] ?? data.today).slice(0, 7);
    const last = data.today.slice(0, 7);
    const months: string[] = [];
    while (cursor <= last && months.length < 36) {
      months.push(cursor);
      cursor = shiftMonth(cursor, 1);
    }
    for (const m of months.slice(-24)) map.set(m, { label: `${SHORT_MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`, commissions: 0, ventes: 0 });
    const key = (d: string) => d.slice(0, 7);
    if (data.canEarnings) for (const e of data.earnings) add(map, key(e.date), e.amountCents, salesFromEarnings ? (e.sales ?? 0) : 0);
    if (!salesFromEarnings) for (const v of data.videos) if (v.postedAt) add(map, key(v.postedAt), 0, v.sales ?? 0);
    return [...map.values()];
  }
  const days =
    range === 'month'
      ? Array.from({ length: daysIn(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
      : Array.from({ length: range === '7d' ? 7 : 30 }, (_, i) => addDays(data.today, -(range === '7d' ? 6 : 29) + i));
  for (const d of days) map.set(d, { label: dayLabel(d), commissions: 0, ventes: 0 });
  if (data.canEarnings) for (const e of data.earnings) add(map, e.date, e.amountCents, salesFromEarnings ? (e.sales ?? 0) : 0);
  if (!salesFromEarnings) for (const v of data.videos) if (v.postedAt) add(map, v.postedAt, 0, v.sales ?? 0);
  return [...map.values()];
}

/** Objectif de vidéos de la période, à partir de l'objectif de la semaine (ou des tableaux de 20 depuis le début). */
function videoGoal(range: StatsRange, month: string, weekly: number, data: ManagerData): number {
  if (range === '7d') return weekly;
  if (range === '30d') return Math.round((weekly * 30) / 7);
  if (range === 'month') return Math.round((weekly * daysIn(month)) / 7);
  return data.products.reduce((s, p) => s + p.videosGoal, 0);
}

/**
 * Haut du tableau de bord : profil et période, une rangée de chiffres, puis le graphique des commissions et des ventes à
 * côté du produit du jour. La période choisie vaut pour les chiffres et le graphique.
 */
export function DashboardPanel({
  profile,
  data,
  weeklyGoal,
  productCard,
}: {
  profile: ReactNode;
  data: ManagerData;
  weeklyGoal: number;
  productCard: ReactNode;
}) {
  const [range, setRange] = useState<StatsRange>('30d');
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const chart = useChartColors();
  const kpis = useMemo(() => managerKpis(data, range, month, null), [data, range, month]);
  const series = useMemo(() => periodSeries(data, range, month), [data, range, month]);
  const goal = videoGoal(range, month, weeklyGoal, data);
  const hasActivity = series.some((p) => p.commissions || p.ventes);
  const periodLabel =
    range === 'month' ? `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}` : RANGES.find((r) => r.id === range)!.label.toLowerCase();
  const monthCommissions = data.earnings.filter((e) => e.date.slice(0, 7) === data.today.slice(0, 7)).reduce((s, e) => s + e.amountCents, 0);
  const goalPct = data.goalCents ? Math.min(100, Math.round((monthCommissions / data.goalCents) * 100)) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {profile}
        <div className="flex flex-wrap items-center gap-2">
          <div className="max-w-full overflow-x-auto">
            <Pills label="Période" items={RANGES} value={range} onChange={setRange} className="w-max" />
          </div>
          {range === 'month' ? (
            <div className="flex items-center gap-1 rounded-full border border-line px-1">
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(month, -1))}
                className="rounded-full p-1.5 text-muted hover:bg-fg/[0.06] hover:text-fg"
                aria-label="Mois précédent"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="min-w-[7.5rem] text-center text-sm font-medium">{periodLabel}</span>
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(month, 1))}
                disabled={month >= data.today.slice(0, 7)}
                className="rounded-full p-1.5 text-muted hover:bg-fg/[0.06] hover:text-fg disabled:opacity-30"
                aria-label="Mois suivant"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
        <KpiCard
          title="Commissions"
          value={formatEuros(kpis.commissionsCents)}
          tone="gain"
          sub={data.canEarnings && goalPct !== null ? `${goalPct} % de l’objectif du mois` : undefined}
          locked={
            data.canEarnings ? undefined : (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
                <Lock className="h-3.5 w-3.5 text-cyan-ink" aria-hidden="true" />
                Inclus dans Pro
              </p>
            )
          }
        />
        <KpiCard title="Ventes" value={formatInt(kpis.sales)} />
        <KpiCard
          title="Vidéos postées"
          value={
            <>
              {formatInt(kpis.videos)}
              <span className="text-base font-semibold text-muted"> / {formatInt(goal)}</span>
            </>
          }
          sub="face à l’objectif"
        />
        <KpiCard title="Échantillons en attente" value={formatInt(kpis.samplesPending)} />
        <KpiCard title="Produits suivis" value={formatInt(data.products.length)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className={cn(panelClass, 'lg:col-span-2')}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{data.canEarnings ? 'Commissions et ventes' : 'Ventes'}</h2>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              {data.canEarnings ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded-full" style={{ background: chart.line }} aria-hidden="true" /> Commissions
                </span>
              ) : null}
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: chart.second }} aria-hidden="true" /> Ventes
              </span>
            </p>
          </div>
          {hasActivity ? (
            <div className="h-64 xl:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tableauCommissions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chart.line} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={chart.line} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis
                    yAxisId="eur"
                    stroke={chart.axis}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v} €`}
                    width={52}
                    hide={!data.canEarnings}
                  />
                  <YAxis yAxisId="ventes" orientation="right" hide />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v, name) =>
                      name === 'Commissions'
                        ? [
                            `${Number(v ?? 0)
                              .toFixed(2)
                              .replace('.', ',')} €`,
                            name,
                          ]
                        : [formatInt(Number(v ?? 0)), name]
                    }
                  />
                  {data.canEarnings ? (
                    <Area
                      yAxisId="eur"
                      type="monotone"
                      dataKey="commissions"
                      name="Commissions"
                      stroke={chart.line}
                      strokeWidth={2}
                      fill="url(#tableauCommissions)"
                    />
                  ) : null}
                  <Area
                    yAxisId="ventes"
                    type="monotone"
                    dataKey="ventes"
                    name="Ventes"
                    stroke={chart.second}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    fill="none"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong text-center xl:h-72">
              <p className="text-sm font-semibold">Rien sur {periodLabel}</p>
              {data.canEarnings ? (
                <LinkButton href="/app?onglet=commissions#gestion" size="sm" variant="outline">
                  Ajouter une commission
                </LinkButton>
              ) : (
                <LinkButton href="/app/passer-pro" size="sm" variant="outline">
                  Suivre mes commissions avec Pro
                </LinkButton>
              )}
            </div>
          )}
        </div>
        {productCard}
      </div>
    </div>
  );
}
