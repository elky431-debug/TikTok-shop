'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatInt } from '@/lib/utils';

export interface SalesPointView {
  label: string;
  ventes: number;
  affilies: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const ventes = payload.find((p) => p.dataKey === 'ventes')?.value ?? 0;
  const affilies = payload.find((p) => p.dataKey === 'affilies')?.value ?? 0;
  return (
    <div className="num rounded-xl border border-line bg-raised px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold">{label}</p>
      <p className="text-cyan-ink">{formatInt(ventes)} ventes estimées</p>
      <p className="text-muted">{formatInt(affilies)} affiliés</p>
    </div>
  );
}

/** Courbe 30 jours : ventes estimées (trait plein) et affiliés (pointillés). */
export function SalesChart({ data }: { data: SalesPointView[] }) {
  return (
    <div className="h-56 w-full text-cyan-ink sm:h-64" role="img" aria-label="Ventes estimées et nombre d'affiliés sur 30 jours">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#8A8B91" strokeOpacity={0.18} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#8A8B91', fontSize: 12 }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            yAxisId="ventes"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#8A8B91', fontSize: 12 }}
            width={44}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
          />
          <YAxis yAxisId="affilies" orientation="right" hide />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#8A8B91', strokeOpacity: 0.4 }} />
          <Line
            yAxisId="affilies"
            type="monotone"
            dataKey="affilies"
            stroke="#8A8B91"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="ventes"
            type="monotone"
            dataKey="ventes"
            stroke="currentColor"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
