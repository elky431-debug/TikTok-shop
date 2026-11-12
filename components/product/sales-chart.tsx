'use client';

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatInt } from '@/lib/utils';

export interface SalesPointView {
  label: string;
  /** null = ventes de ce jour inconnues (trou dans la courbe). */
  ventes: number | null;
  affilies: number | null;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const ventes = payload.find((p) => p.dataKey === 'ventes')?.value;
  const affilies = payload.find((p) => p.dataKey === 'affilies')?.value;
  return (
    <div className="num rounded-xl border border-line-strong bg-raised/95 px-3 py-2 text-sm shadow-2xl backdrop-blur-xl">
      <p className="font-semibold text-fg">{label}</p>
      <p className="text-cyan-ink">{ventes === undefined || ventes === null ? 'Ventes inconnues' : `${formatInt(ventes)} ventes estimées`}</p>
      {affilies === undefined || affilies === null ? null : <p className="text-muted">{formatInt(affilies)} affiliés</p>}
    </div>
  );
}

/** Courbe 30 jours : ventes estimées en cyan avec remplissage dégradé, affiliés en pointillés gris. */
export function SalesChart({ data, showAffiliates = true }: { data: SalesPointView[]; showAffiliates?: boolean }) {
  return (
    <div className="h-56 w-full sm:h-64" role="img" aria-label="Ventes estimées et nombre d'affiliés sur 30 jours">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="ventes-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#25F4EE" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#25F4EE" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#FFFFFF" strokeOpacity={0.06} vertical={false} />
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
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#25F4EE', strokeOpacity: 0.3 }} />
          {showAffiliates ? (
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
          ) : null}
          <Area
            yAxisId="ventes"
            type="monotone"
            dataKey="ventes"
            stroke="#25F4EE"
            strokeWidth={2.5}
            fill="url(#ventes-fill)"
            dot={false}
            activeDot={{ r: 4, fill: '#25F4EE', stroke: '#000' }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
