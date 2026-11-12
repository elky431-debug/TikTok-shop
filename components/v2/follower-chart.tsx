import { formatInt, formatShortDate } from '@/lib/utils';
import type { FollowerEntry } from '@/lib/v2/preparation';

/**
 * Courbe des abonnés saisis à la main (SVG rendu côté serveur, cyan avec remplissage dégradé), avec la ligne du seuil
 * d'affiliation en pointillés roses. Un seul point : pas de courbe, juste le chiffre.
 */
export function FollowerChart({ entries, threshold }: { entries: FollowerEntry[]; threshold: number }) {
  if (entries.length < 2) return null;
  const width = 600;
  const height = 200;
  const pad = { top: 14, right: 12, bottom: 26, left: 44 };
  const t0 = Date.parse(`${entries[0].date}T12:00:00Z`);
  const t1 = Date.parse(`${entries.at(-1)!.date}T12:00:00Z`);
  const span = Math.max(1, t1 - t0);
  const maxCount = Math.max(threshold * 1.1, ...entries.map((e) => e.count));
  const x = (date: string) => pad.left + ((Date.parse(`${date}T12:00:00Z`) - t0) / span) * (width - pad.left - pad.right);
  const y = (count: number) => pad.top + (1 - count / maxCount) * (height - pad.top - pad.bottom);
  const points = entries.map((e) => `${x(e.date).toFixed(1)},${y(e.count).toFixed(1)}`);
  const area = `M${x(entries[0].date).toFixed(1)},${height - pad.bottom} L${points.join(' L')} L${x(entries.at(-1)!.date).toFixed(1)},${height - pad.bottom} Z`;
  const first = entries[0];
  const last = entries.at(-1)!;
  const ticks = [0, Math.round(maxCount / 2), Math.round(maxCount)];

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full text-cyan-ink"
        role="img"
        aria-label={`Abonnés : ${formatInt(first.count)} le ${formatShortDate(first.date)}, ${formatInt(last.count)} le ${formatShortDate(last.date)}. Seuil : ${formatInt(threshold)}.`}
      >
        <defs>
          <linearGradient id="abonnes-remplissage" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="rgb(var(--fg))" strokeOpacity="0.08" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--muted))">
              {t >= 1000 ? `${(t / 1000).toFixed(1).replace('.', ',')} k` : t}
            </text>
          </g>
        ))}
        <g className="text-rose-ink">
          <line x1={pad.left} x2={width - pad.right} y1={y(threshold)} y2={y(threshold)} stroke="currentColor" strokeDasharray="5 5" strokeWidth="1.5" />
          <text x={width - pad.right} y={y(threshold) - 6} textAnchor="end" fontSize="11" fill="currentColor">
            seuil {formatInt(threshold)}
          </text>
        </g>
        <path d={area} fill="url(#abonnes-remplissage)" />
        <polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {entries.map((e) => (
          <circle key={e.date} cx={x(e.date)} cy={y(e.count)} r="3" fill="currentColor" />
        ))}
        <text x={pad.left} y={height - 6} fontSize="11" fill="rgb(var(--muted))">
          {formatShortDate(first.date)}
        </text>
        <text x={width - pad.right} y={height - 6} textAnchor="end" fontSize="11" fill="rgb(var(--muted))">
          {formatShortDate(last.date)}
        </text>
      </svg>
    </figure>
  );
}
