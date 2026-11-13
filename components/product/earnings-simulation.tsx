'use client';

import { useId, useState } from 'react';
import { SIMULATION_DEFAULTS, SIMULATION_HINTS, SIMULATION_LIMITS, simulateEarnings } from '@/lib/radar/simulation';
import { formatEuros, formatInt } from '@/lib/utils';

type Key = keyof typeof SIMULATION_DEFAULTS;

const FIELDS: Array<{ key: Key; label: string; suffix?: string; step: string }> = [
  { key: 'views', label: 'Vues par vidéo', step: '100' },
  { key: 'clickRate', label: 'Taux de clic sur le produit', suffix: '%', step: '0.1' },
  { key: 'conversionRate', label: 'Taux de conversion', suffix: '%', step: '0.1' },
  { key: 'videos', label: 'Nombre de vidéos', step: '1' },
];

/**
 * « Simulation » : hypothèses réglables, résultat en fourchette. Le calcul est local (aucune donnée envoyée) et la
 * commission par vente est celle du produit aujourd'hui. Ce n'est pas une promesse.
 */
export function EarningsSimulation({ commissionCents }: { commissionCents: number }) {
  const id = useId();
  const [values, setValues] = useState<Record<Key, string>>({
    views: String(SIMULATION_DEFAULTS.views),
    clickRate: String(SIMULATION_DEFAULTS.clickRate),
    conversionRate: String(SIMULATION_DEFAULTS.conversionRate),
    videos: String(SIMULATION_DEFAULTS.videos),
  });
  const num = (key: Key) => Number(values[key].replace(',', '.'));
  const result = simulateEarnings({
    views: num('views'),
    clickRate: num('clickRate'),
    conversionRate: num('conversionRate'),
    videos: num('videos'),
    commissionCents,
  });

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label htmlFor={`${id}-${field.key}`} className="mb-1 block text-sm font-semibold">
              {field.label}
            </label>
            <div className="relative">
              <input
                id={`${id}-${field.key}`}
                type="number"
                inputMode="decimal"
                min={SIMULATION_LIMITS[field.key].min}
                max={SIMULATION_LIMITS[field.key].max}
                step={field.step}
                value={values[field.key]}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                aria-describedby={`${id}-${field.key}-aide`}
                className="num h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 pr-9 text-[0.95rem] text-fg focus:border-cyan-ink/50 focus:outline-none focus-visible:outline-2 focus-visible:outline-cyan"
              />
              {field.suffix ? <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">{field.suffix}</span> : null}
            </div>
            <p id={`${id}-${field.key}-aide`} className="mt-1 text-xs text-muted">
              {SIMULATION_HINTS[field.key]}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl bg-surface p-4" aria-live="polite">
        <p className="text-sm text-muted">Avec ces hypothèses, sur l’ensemble des vidéos :</p>
        <p className="num mt-1 text-lg font-semibold">
          entre {formatInt(result.sales.low)} et {formatInt(result.sales.high)} ventes, soit entre{' '}
          <span className="text-gain">{formatEuros(result.commission_cents.low)}</span> et{' '}
          <span className="text-gain">{formatEuros(result.commission_cents.high)}</span> de commissions
        </p>
        <p className="num mt-1 text-xs text-muted">
          Calcul central : {formatInt(result.clicks)} clics, {formatInt(result.sales.mid)} ventes × {formatEuros(commissionCents)} par vente.
          La fourchette va de la moitié à une fois et demie ce calcul, parce que les vues changent beaucoup d’une vidéo à l’autre.
        </p>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Simulation, pas une promesse : les résultats réels dépendent de ton compte, de tes vidéos et du produit, et peuvent être
        nuls. La commission peut changer, et les retours ou annulations ne sont pas comptés.
      </p>
    </div>
  );
}
