'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function SignupsChart({ data }: { data: Array<{ label: string; inscrits: number }> }) {
  return (
    <div className="h-40 w-full text-cyan-ink" role="img" aria-label="Inscriptions d’élèves par semaine sur 8 semaines">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
          <defs>
            <linearGradient id="inscrits-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#25F4EE" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#25F4EE" stopOpacity={0.15} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8A8B91', fontSize: 11 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#8A8B91', fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: '#FFFFFF', fillOpacity: 0.04 }}
            contentStyle={{ background: '#0A0A0B', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, color: '#fff' }}
            formatter={(value) => [String(value), 'Inscrits']}
            labelFormatter={(label) => `Semaine du ${String(label)}`}
          />
          <Bar dataKey="inscrits" fill="url(#inscrits-fill)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
