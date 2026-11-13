'use client';

import { Star } from 'lucide-react';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

type Sold = 'oui' | 'non' | null;

/**
 * Note du script (1 à 5) et « Il a vendu ? ». Chaque choix est enregistré tout de suite (action serveur) ; l'affichage
 * change avant la réponse pour rester réactif. Fonctionne aussi sans JavaScript (boutons d'envoi classiques).
 */
export function RatingForm({
  action,
  docId,
  index,
  stars,
  sold,
}: {
  action: (formData: FormData) => Promise<void>;
  docId: string;
  index: number;
  stars: number | null;
  sold: Sold;
}) {
  const [current, setCurrent] = useState(stars);
  const [hover, setHover] = useState<number | null>(null);
  const [currentSold, setCurrentSold] = useState<Sold>(sold);
  const shown = hover ?? current ?? 0;

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input type="hidden" name="id" value={docId} />
      <input type="hidden" name="script" value={index} />
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Ta note</span>
        <div className="flex" role="group" aria-label="Note sur 5" onMouseLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="submit"
              name="note"
              value={current === n ? '0' : String(n)}
              onClick={() => setCurrent(current === n ? null : n)}
              onMouseEnter={() => setHover(n)}
              aria-label={current === n ? `Retirer la note ${n} sur 5` : `Noter ${n} sur 5`}
              aria-pressed={current !== null && n <= current}
              className="flex h-10 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:text-fg"
            >
              <Star className={cn('h-6 w-6 transition-colors', n <= shown ? 'fill-[#25F4EE] text-[#25F4EE]' : '')} aria-hidden="true" />
            </button>
          ))}
        </div>
        <Saving />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Il a vendu ?</span>
        <div className="flex rounded-full border border-line p-0.5" role="group" aria-label="Il a vendu ?">
          {(
            [
              ['oui', 'Oui'],
              ['non', 'Non'],
              ['', 'Pas encore'],
            ] as const
          ).map(([value, label]) => {
            const active = (currentSold ?? '') === value;
            return (
              <button
                key={label}
                type="submit"
                name="vendu"
                value={value || 'aucun'}
                onClick={() => setCurrentSold(value === '' ? null : value)}
                aria-pressed={active}
                className={cn(
                  'h-8 rounded-full px-3 text-xs font-semibold transition-colors',
                  active ? (value === 'oui' ? 'bg-gain-soft text-gain' : 'bg-surface text-fg') : 'text-muted hover:text-fg',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </form>
  );
}

function Saving() {
  const { pending } = useFormStatus();
  return (
    <span className="text-xs text-muted" aria-live="polite">
      {pending ? 'Enregistrement…' : ''}
    </span>
  );
}
