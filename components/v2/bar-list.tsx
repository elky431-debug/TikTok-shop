import { cn, formatEuros } from '@/lib/utils';

/** Liste de barres horizontales (libellé, barre, montant), lisible sur mobile, rendue côté serveur. */
export function BarList({
  items,
  label,
  tone = 'cyan',
  empty = 'Rien à montrer pour l’instant.',
}: {
  items: Array<{ key: string; label: string; cents: number; hint?: string }>;
  /** Nom de la liste pour les lecteurs d'écran. */
  label: string;
  tone?: 'cyan' | 'gain';
  empty?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.cents));
  if (!items.length) return <p className="mt-3 text-sm text-muted">{empty}</p>;
  return (
    <ol className="mt-4 space-y-2.5" aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_5.5rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,10rem)_1fr_6rem]">
          <span className="min-w-0">
            <span className="line-clamp-1 text-muted">{item.label}</span>
            {item.hint ? <span className="line-clamp-1 text-xs text-subtle">{item.hint}</span> : null}
          </span>
          <span className="h-2.5 rounded-full bg-surface" aria-hidden="true">
            <span
              className={cn('block h-full rounded-full', tone === 'gain' ? 'bg-gain' : 'bg-cyan-ink')}
              style={{ width: `${Math.max(item.cents > 0 ? 2 : 0, (item.cents / max) * 100)}%` }}
            />
          </span>
          <span className="num text-right font-medium">{formatEuros(item.cents)}</span>
        </li>
      ))}
    </ol>
  );
}
