'use client';

import { useChartColors } from '@/components/charts/colors';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PeriodBar } from '@/lib/product-periods';
import { formatInt } from '@/lib/utils';

function PeriodTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PeriodBar }> }) {
  const bar = active ? payload?.[0]?.payload : null;
  if (!bar) return null;
  return (
    <div className="num rounded-xl border border-line-strong bg-raised/95 px-3 py-2 text-sm shadow-2xl backdrop-blur-xl">
      <p className="font-semibold text-fg">{bar.days === 1 ? 'Dernières 24 heures' : `${bar.days} derniers jours`}</p>
      <p className="text-cyan-ink">{formatInt(bar.perDay)} ventes par jour en moyenne</p>
      <p className="text-muted">{formatInt(bar.total)} ventes au total</p>
    </div>
  );
}

/** Ventes moyennes par jour sur chaque période : la barre de gauche plus haute = le produit accélère. */
export function SalesPeriodsChart({ bars }: { bars: PeriodBar[] }) {
  const c = useChartColors();
  return (
    <div className="h-56 w-full sm:h-64" role="img" aria-label="Ventes moyennes par jour sur différentes périodes">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="periodes-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={c.line} stopOpacity={0.9} />
              <stop offset="100%" stopColor={c.line} stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} strokeOpacity={0.06} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: c.axis, fontSize: 12 }}
            width={44}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
          />
          <Tooltip content={<PeriodTooltip />} cursor={{ fill: c.line, fillOpacity: 0.06 }} />
          <Bar dataKey="perDay" fill="url(#periodes-fill)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
