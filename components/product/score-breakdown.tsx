import type { ProductView } from '@/lib/radar';
import { SCALE } from '@/lib/score';
import { cn } from '@/lib/utils';

const fr = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Liste lisible : « l’échantillon et le nombre d’affiliés ». */
function joinFr(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`;
}

const MISSING_NAMES: Record<string, string> = {
  croissance: 'la croissance',
  saturation: 'le nombre d’affiliés',
  echantillon: 'l’échantillon gratuit',
};

/**
 * « Pourquoi ce score » : une phrase par critère, avec les points si le plan les montre.
 * Un critère que la source ne fournit pas est signalé, et son poids réparti sur les autres.
 */
export function ScoreBreakdownList({ breakdown, score }: { breakdown: NonNullable<ProductView['breakdown']>; score?: number | null }) {
  const missing = breakdown.parts.filter((p) => !p.available).map((p) => MISSING_NAMES[p.key] ?? p.label.toLowerCase());
  return (
    <div>
      {missing.length ? (
        <p className="mb-4 rounded-xl bg-surface p-3 text-sm leading-relaxed text-muted">
          Calculé sans {joinFr(missing)}, faute de donnée pour l’instant. {missing.length > 1 ? 'Leur' : 'Son'} poids
          est réparti sur les autres critères, au prorata.
        </p>
      ) : null}
      <ul className="divide-y divide-line">
        {breakdown.parts.map((part) => (
          <li key={part.key} className="flex gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-semibold', !part.available && 'text-muted')}>
                {part.label}
                {!part.available ? <span className="font-normal"> · non fourni</span> : null}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{part.sentence}</p>
            </div>
            {part.points !== null && part.available ? (
              <div className="w-24 shrink-0 text-right">
                <p className="num text-sm font-semibold">
                  {fr(part.points)}
                  <span className="font-normal text-muted"> / {fr(part.applied_weight)}</span>
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                  <div
                    className={cn('h-full rounded-full', part.points / part.applied_weight >= 0.6 ? 'bg-cyan-ink' : 'bg-subtle')}
                    style={{ width: `${Math.round((part.points / Math.max(0.1, part.applied_weight)) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {breakdown.raw !== null && score !== null && score !== undefined ? (
        <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-muted">
          Total des points : <span className="num font-semibold text-fg">{breakdown.raw}</span> sur 100. Le score{' '}
          <span className="num font-semibold text-fg">{score}</span> place ce produit parmi ceux du jour, sur une échelle
          qui va de {SCALE.min} (le moins intéressant) à {SCALE.max} (le plus intéressant).
        </p>
      ) : null}
    </div>
  );
}
