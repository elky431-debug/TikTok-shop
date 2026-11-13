'use client';

import type { ScriptFormat } from '@/lib/db/types';
import { Fingerprint, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useFormState } from 'react-dom';
import { OptionChip, OptionGroup } from '@/components/studio/option-chip';
import { Label, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout } from '@/components/ui/surface';
import { ANGLES, DURATION_HINTS, DURATIONS, SCRIPT_FORMATS, TONES, type ScriptSettings } from '@/lib/ai/formats';
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
  settings,
  style,
  feedbackCount,
  draft = null,
  formats,
  formatsPlan,
  unlimited = false,
}: {
  today: Option[];
  saved: Option[];
  selected?: string;
  remaining: number;
  disabled: boolean;
  settings: ScriptSettings;
  /** « actif », « inactif », « absent » (Pro sans style) ou « verrouillé » (Starter). */
  style: 'actif' | 'inactif' | 'absent' | 'verrouille';
  feedbackCount: number;
  /** Brouillon envoyé par l'analyse de vidéo : présélectionne le format et sert d'inspiration. */
  draft?: { id: string; title: string; lines: string[]; format: ScriptFormat | null } | null;
  /** Formats ouverts par le plan (5 en Starter, 8 ensuite) ; les autres restent visibles, fermés. */
  formats: string[];
  /** Plan qui ouvre les formats fermés (« Pro »). */
  formatsPlan: string;
  /** Écritures « illimitées » : ni plafond ni reste affichés. */
  unlimited?: boolean;
}) {
  const [state, action] = useFormState<StudioState, FormData>(generateAction, {});
  const hasProducts = today.length + saved.length > 0;

  return (
    <form action={action} className="space-y-6">
      {draft ? (
        <Callout tone="cyan" title={`Inspiration : ${draft.title}`}>
          <input type="hidden" name="brouillon" value={draft.id} />
          <p>Tes scripts reprendront l’idée de cette vidéo, adaptée à ton produit, sans la copier.</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-semibold text-cyan-ink">Voir le texte envoyé</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {draft.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </details>
        </Callout>
      ) : null}
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
          <p className="text-sm text-muted">
            Aucun produit disponible.{' '}
            <Link href="/app/radar" className="font-semibold text-cyan-ink underline underline-offset-2">
              Ouvre le radar
            </Link>{' '}
            pour en choisir un.
          </p>
        )}
      </div>

      <OptionGroup legend="Format de la vidéo" columns="grid-cols-2 lg:grid-cols-4">
        {SCRIPT_FORMATS.map((format, i) => {
          const open = formats.includes(format.id);
          return (
            <OptionChip
              key={format.id}
              name="format"
              value={format.id}
              disabled={!open}
              defaultChecked={open && (draft?.format && formats.includes(draft.format) ? draft.format === format.id : i === 0)}
              hint={open ? format.hint : `Inclus avec ${formatsPlan}.`}
            >
              {format.label}
              {open ? null : <span className="ml-1.5 rounded-full border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{formatsPlan}</span>}
            </OptionChip>
          );
        })}
      </OptionGroup>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <OptionGroup legend="Durée" columns="grid-cols-3">
          {DURATIONS.map((d) => (
            <OptionChip key={d} name="duree" value={String(d)} defaultChecked={settings.duration === d} hint={DURATION_HINTS[d]} className="lg:w-36">
              <span className="num">{d} s</span>
            </OptionChip>
          ))}
        </OptionGroup>
        <OptionGroup legend="Ton" columns="grid-cols-2 sm:grid-cols-4">
          {TONES.map((t) => (
            <OptionChip key={t.id} name="ton" value={t.id} defaultChecked={settings.tone === t.id} hint={t.hint}>
              {t.label}
            </OptionChip>
          ))}
        </OptionGroup>
      </div>

      <OptionGroup legend="Angle" columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {ANGLES.map((a) => (
          <OptionChip key={a.id} name="angle" value={a.id} defaultChecked={settings.angle === a.id} hint={a.hint}>
            {a.label}
          </OptionChip>
        ))}
      </OptionGroup>

      <ul className="space-y-1.5 text-sm text-muted">
        <li className="flex items-start gap-2">
          <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-cyan-ink" aria-hidden="true" />
          {style === 'actif' ? (
            <span>
              Ton style perso est appliqué.{' '}
              <Link href="/app/studio/style" className="font-semibold text-fg underline underline-offset-2">
                Le modifier
              </Link>
            </span>
          ) : style === 'inactif' ? (
            <span>
              Ton style perso est en pause.{' '}
              <Link href="/app/studio/style" className="font-semibold text-fg underline underline-offset-2">
                Le réactiver
              </Link>
            </span>
          ) : style === 'absent' ? (
            <span>
              Colle 3 textes de tes vidéos pour que les scripts parlent comme toi.{' '}
              <Link href="/app/studio/style" className="font-semibold text-fg underline underline-offset-2">
                Créer mon style
              </Link>
            </span>
          ) : (
            <span>
              Scripts écrits avec ta phrase type. Le style perso (tiré de tes vidéos) arrive avec{' '}
              <Link href="/app/passer-pro" className="font-semibold text-fg underline underline-offset-2">
                le plan Pro
              </Link>
              .
            </span>
          )}
        </li>
        <li className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-ink" aria-hidden="true" />
          <span>
            {feedbackCount > 0
              ? `${feedbackCount} de tes scripts les mieux notés serviront d’exemple.`
              : 'Note tes scripts après les avoir tournés : les mieux notés servent d’exemple aux suivants.'}
          </span>
        </li>
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <SubmitButton size="lg" pendingLabel="Écriture de tes scripts…" disabled={disabled || !hasProducts} className="sm:min-w-64">
          Écrire mes scripts
        </SubmitButton>
        <p className="text-sm text-muted">
          {unlimited
            ? remaining > 0
              ? 'Écritures illimitées.'
              : 'Limite de sécurité du jour atteinte. Ton compteur repart à zéro demain matin.'
            : remaining > 0
              ? `Il te reste ${remaining} écriture${remaining > 1 ? 's' : ''} aujourd’hui.`
              : 'Plus d’écriture disponible aujourd’hui.'}
        </p>
      </div>
    </form>
  );
}
