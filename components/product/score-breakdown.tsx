import type { ProductView } from '@/lib/radar';
import { cn } from '@/lib/utils';

/** « Pourquoi ce score » : une phrase par composante, avec les points si le plan les montre. */
export function ScoreBreakdownList({ breakdown }: { breakdown: NonNullable<ProductView['breakdown']> }) {
  return (
    <ul className="divide-y divide-line">
      {breakdown.parts.map((part) => (
        <li key={part.key} className="flex gap-4 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{part.label}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">{part.sentence}</p>
          </div>
          {part.points !== null ? (
            <div className="w-20 shrink-0 text-right">
              <p className="num text-sm font-semibold">
                {String(part.points).replace('.', ',')}
                <span className="font-normal text-muted"> / {part.weight}</span>
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                <div
                  className={cn('h-full rounded-full', part.points / part.weight >= 0.6 ? 'bg-cyan-ink' : 'bg-subtle')}
                  style={{ width: `${Math.round((part.points / part.weight) * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
