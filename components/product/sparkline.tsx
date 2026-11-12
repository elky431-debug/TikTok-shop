import { cn } from '@/lib/utils';

/** Mini-courbe SVG rendue côté serveur (légère : pas de librairie de graphiques sur les cartes). */
export function Sparkline({
  values,
  width = 96,
  height = 32,
  className,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  label?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))] as const;
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `M${points[0][0]},${height} L${line.replace(/ /g, ' L')} L${points[points.length - 1][0]},${height} Z`;
  const rising = values[values.length - 1] >= values[0];
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn(rising ? 'text-cyan-ink' : 'text-rose-ink', className)}
      role="img"
      aria-label={label ?? (rising ? 'Ventes en hausse sur 7 jours' : 'Ventes en baisse sur 7 jours')}
    >
      <path d={area} fill="currentColor" fillOpacity="0.12" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.6" fill="currentColor" />
    </svg>
  );
}
