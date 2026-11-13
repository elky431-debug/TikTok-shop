'use client';

import { useState } from 'react';
import { saveWeightsAction } from '@/app/app/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import type { ScorePartKey } from '@/lib/db/types';
import { DEFAULT_WEIGHTS, SCORE_KEYS, WEIGHT_LABELS, WEIGHT_PRESETS, weightShares, type Weights } from '@/lib/radar/personal';

const HINTS: Record<ScorePartKey, string> = {
  croissance: 'Ventes des 7 derniers jours comparées aux semaines d’avant.',
  commission: 'Taux de commission du produit.',
  saturation: 'Peu d’affiliés pour beaucoup de ventes.',
  prix: 'Prix entre 15 et 60 €.',
};

/** Poids du score (Elite) : quatre curseurs, deux réglages tout prêts et le retour au réglage par défaut. */
export function ScoreWeightsForm({ weights, query }: { weights: Weights | null; query: string }) {
  const [values, setValues] = useState<Weights>(weights ?? DEFAULT_WEIGHTS);
  const shares = weightShares(values);
  return (
    <form action={saveWeightsAction} className="space-y-4">
      <input type="hidden" name="retour" value={query} />
      <div className="grid gap-4 sm:grid-cols-2">
        {SCORE_KEYS.map((key) => (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`poids-${key}`} className="text-sm font-semibold">
                {WEIGHT_LABELS[key]}
              </label>
              <span className="num text-sm text-muted">{String(shares[key]).replace('.', ',')} / 100</span>
            </div>
            <input
              id={`poids-${key}`}
              name={key}
              type="range"
              min={0}
              max={100}
              step={5}
              value={values[key]}
              onChange={(e) => setValues((v) => ({ ...v, [key]: Number(e.target.value) }))}
              className="mt-2 w-full accent-[color:var(--cyan-hex)]"
              aria-describedby={`poids-${key}-aide`}
            />
            <p id={`poids-${key}-aide`} className="text-xs text-muted">
              {HINTS[key]}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" pendingLabel="Enregistrement…">
          Appliquer ces poids
        </SubmitButton>
        {(Object.keys(WEIGHT_PRESETS) as Array<keyof typeof WEIGHT_PRESETS>).map((id) => (
          <SubmitButton key={id} size="sm" variant="outline" name="reglage" value={id}>
            {WEIGHT_PRESETS[id].label}
          </SubmitButton>
        ))}
        <SubmitButton size="sm" variant="ghost" name="reglage" value="defaut">
          Revenir au réglage par défaut
        </SubmitButton>
      </div>
      <p className="text-xs text-muted">
        Chaque poids est ramené sur 100 au total. Un critère que la source ne fournit pas reste ignoré, et son poids est réparti sur les autres.
      </p>
    </form>
  );
}
