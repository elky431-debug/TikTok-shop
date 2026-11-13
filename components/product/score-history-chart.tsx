'use client';

import { useChartColors } from '@/components/charts/colors';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SCALE } from '@/lib/score';

export interface ScorePointView {
  label: string;
  score: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="num rounded-xl border border-line-strong bg-raised/95 px-3 py-2 text-sm shadow-2xl backdrop-blur-xl">
      <p className="font-semibold text-fg">{label}</p>
      <p className="text-cyan-ink">Score {payload[0].value}</p>
    </div>
  );
}

/** Évolution du score du jour sur 30 jours (instantanés quotidiens), sur l'échelle affichée de 15 à 90. */
export function ScoreHistoryChart({ data }: { data: ScorePointView[] }) {
  const c = useChartColors();
  return (
    <div className="h-44 w-full" role="img" aria-label={`Score des ${data.length} derniers jours, de ${data[0]?.score} à ${data.at(-1)?.score}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="score-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={c.line} stopOpacity={0.25} />
              <stop offset="100%" stopColor={c.line} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} strokeOpacity={0.06} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 12 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis domain={[SCALE.min, SCALE.max]} ticks={[15, 45, 60, 75, 90]} tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 12 }} width={40} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.line, strokeOpacity: 0.3 }} />
          <Area
            type="monotone"
            dataKey="score"
            stroke={c.line}
            strokeWidth={2.5}
            fill="url(#score-fill)"
            dot={data.length < 3}
            activeDot={{ r: 4, fill: c.line, stroke: c.page }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
