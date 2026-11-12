'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { ChoiceChip, Label, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout } from '@/components/ui/surface';
import { SCRIPT_FORMATS } from '@/lib/ai/formats';
import { generateAction, type StudioState } from './actions';

interface Option {
  id: string;
  name: string;
}

export function StudioForm({
  today,
  saved,
  selected,
  remaining,
  disabled,
}: {
  today: Option[];
  saved: Option[];
  selected?: string;
  remaining: number;
  disabled: boolean;
}) {
  const [state, action] = useFormState<StudioState, FormData>(generateAction, {});
  const hasProducts = today.length + saved.length > 0;

  return (
    <form action={action} className="space-y-6">
      {state.error ? (
        <Callout
          tone={state.code === 'limite' ? 'warn' : 'rose'}
          title={state.code === 'limite' ? 'Limite du jour atteinte' : 'Scripts non écrits'}
          action={
            state.code === 'limite' || state.code === 'acces' ? (
              <Link href="/app/passer-pro" className="text-sm font-semibold text-rose-ink underline underline-offset-2">
                Voir les plans
              </Link>
            ) : null
          }
        >
          {state.error}
        </Callout>
      ) : null}

      <div>
        <Label htmlFor="produit">Produit</Label>
        {hasProducts ? (
          <Select id="produit" name="produit" defaultValue={selected ?? today[0]?.id ?? saved[0]?.id} required>
            {today.length ? (
              <optgroup label="Tes produits du jour">
                {today.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {saved.length ? (
              <optgroup label="Mes produits">
                {saved.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        ) : (
          <p className="text-sm text-muted">Aucun produit disponible. Ouvre le radar pour en choisir un.</p>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Format de la vidéo</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {SCRIPT_FORMATS.map((format, i) => (
            <ChoiceChip key={format.id} type="radio" name="format" value={format.id} defaultChecked={i === 0} description={format.hint}>
              {format.label}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <SubmitButton size="lg" pendingLabel="Écriture de tes scripts…" disabled={disabled || !hasProducts} className="sm:min-w-64">
          Écrire mes scripts
        </SubmitButton>
        <p className="text-sm text-muted">
          {Number.isFinite(remaining)
            ? remaining > 0
              ? `Il te reste ${remaining} écriture${remaining > 1 ? 's' : ''} aujourd’hui.`
              : 'Plus d’écriture disponible aujourd’hui.'
            : 'Écritures illimitées avec Pro+.'}
        </p>
      </div>
    </form>
  );
}
