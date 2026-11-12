'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function SignupsChart({ data }: { data: Array<{ label: string; inscrits: number }> }) {
  return (
    <div className="h-40 w-full text-cyan-ink" role="img" aria-label="Inscriptions d’élèves par semaine sur 8 semaines">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8A8B91', fontSize: 11 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#8A8B91', fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: '#8A8B91', fillOpacity: 0.1 }}
            formatter={(value) => [String(value), 'Inscrits']}
            labelFormatter={(label) => `Semaine du ${String(label)}`}
          />
          <Bar dataKey="inscrits" fill="currentColor" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
