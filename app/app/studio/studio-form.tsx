'use client';

import type { ScriptFormat } from '@/lib/db/types';
import { ChevronDown, Fingerprint, Lock, Radar, SlidersHorizontal, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import { ProductImage } from '@/components/product/product-image';
import { FormatIcon } from '@/components/studio/format-icon';
import { LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, EmptyState } from '@/components/ui/surface';
import { ANGLES, DURATION_HINTS, DURATIONS, SCRIPT_FORMATS, TONES, type ScriptSettings } from '@/lib/ai/formats';
import { cn } from '@/lib/utils';
import { generateAction, type StudioState } from './actions';

export interface StudioProductOption {
  id: string;
  name: string;
  image: string;
  fallback: string;
  /** « 24,90 € » */
  price: string;
  /** « 15 % » ou null si la source ne le dit pas. */
  commission: string | null;
}

const labelClass = 'mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted';

/** Petit choix (durée, ton, angle) : pastille arrondie, l'aide passe en info-bulle native. */
function Chip({
  name,
  value,
  checked,
  onChange,
  title,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      title={title}
      className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-line-strong hover:text-fg has-[:checked]:border-cyan-ink/60 has-[:checked]:bg-cyan-ink/[0.07] has-[:checked]:text-fg has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan"
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

export function StudioForm({
  today,
  saved,
  searched = [],
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
  today: StudioProductOption[];
  saved: StudioProductOption[];
  /** Produit ouvert depuis la recherche. */
  searched?: StudioProductOption[];
  selected?: string;
  remaining: number;
  disabled: boolean;
  settings: ScriptSettings;
  /** « actif », « inactif », « absent » (Pro sans style) ou « verrouillé » (Starter). */
  style: 'actif' | 'inactif' | 'absent' | 'verrouille';
  feedbackCount: number;
  /** Brouillon envoyé par l'analyse de vidéo : présélectionne le format et sert d'inspiration. */
  draft?: {
    id: string;
    title: string;
    lines: string[];
    format: ScriptFormat | null;
  } | null;
  /** Formats ouverts par le plan (5 en Starter, 8 ensuite) ; les autres restent visibles, fermés. */
  formats: string[];
  /** Plan qui ouvre les formats fermés (« Pro »). */
  formatsPlan: string;
  /** Écritures « illimitées » : ni plafond ni reste affichés. */
  unlimited?: boolean;
}) {
  const [state, action] = useFormState<StudioState, FormData>(generateAction, {});
  const all = [...searched, ...today, ...saved];
  const [productId, setProductId] = useState(selected ?? all[0]?.id ?? '');
  const [picking, setPicking] = useState(false);
  const firstFormat = draft?.format && formats.includes(draft.format) ? draft.format : SCRIPT_FORMATS.find((f) => formats.includes(f.id))?.id;
  const [format, setFormat] = useState<string | undefined>(firstFormat);
  const [duration, setDuration] = useState(settings.duration);
  const [tone, setTone] = useState(settings.tone);
  const [angle, setAngle] = useState(settings.angle);
  const product = all.find((p) => p.id === productId);

  if (!all.length) {
    return (
      <EmptyState
        icon={<Radar className="h-5 w-5" />}
        title="Choisis d’abord un produit"
        action={
          <LinkButton href="/app/radar" arrow>
            Ouvrir le radar
          </LinkButton>
        }
      />
    );
  }

  const groups = [
    { label: 'Depuis ta recherche', items: searched },
    { label: 'Du jour', items: today },
    { label: 'Mes produits', items: saved },
  ].filter((g) => g.items.length);

  return (
    <form action={action}>
      {/* Next ajoute des champs cachés en tête de formulaire : l'espacement se fait dans ce bloc. */}
      <div className="space-y-10">
        {draft ? (
          <Callout tone="cyan" title={`Inspiration : ${draft.title}`}>
            <input type="hidden" name="brouillon" value={draft.id} />
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-cyan-ink">Voir le texte de la vidéo</summary>
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

        {/* Produit : la carte du produit choisi ; « Changer » ouvre la grille. */}
        <fieldset className="min-w-0">
          <legend className={labelClass}>Produit</legend>
          {product ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-raised p-3 pr-4 sm:flex-nowrap sm:p-4">
              <ProductImage src={product.image} fallback={product.fallback} alt="" className="h-16 w-16 rounded-xl sm:h-20 sm:w-20" />
              <div className="min-w-0 flex-1 basis-40">
                <p className="line-clamp-2 text-base font-bold leading-snug tracking-tight sm:text-lg">{product.name}</p>
                <p className="num mt-0.5 text-sm text-muted">
                  <span className="font-semibold text-fg">{product.price}</span>
                  {product.commission ? <span className="text-cyan-ink"> · {product.commission} de commission</span> : null}
                </p>
              </div>
              {all.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setPicking((v) => !v)}
                  aria-expanded={picking}
                  aria-controls="choix-produit"
                  className="ml-auto inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-line px-3 text-sm font-semibold transition-colors hover:bg-surface"
                >
                  Changer
                  <ChevronDown className={cn('h-4 w-4 transition-transform', picking && 'rotate-180')} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}
          <div id="choix-produit" hidden={!picking} className="mt-4 max-h-[26rem] space-y-5 overflow-y-auto overscroll-contain pr-1">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 text-xs font-semibold text-muted">{group.label}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {group.items.map((p) => (
                    <label
                      key={p.id}
                      className="group cursor-pointer rounded-xl border border-line bg-raised p-2 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong has-[:checked]:border-cyan-ink/60 has-[:checked]:bg-cyan-ink/[0.07] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan"
                    >
                      <input
                        type="radio"
                        name="produit"
                        value={p.id}
                        checked={productId === p.id}
                        onChange={() => {
                          setProductId(p.id);
                          setPicking(false);
                        }}
                        className="sr-only"
                      />
                      <ProductImage src={p.image} fallback={p.fallback} alt="" className="w-full rounded-lg" />
                      <span className="mt-1.5 line-clamp-2 text-xs font-semibold leading-snug">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {/* Format : cartes illustrées, icône et titre. */}
        <fieldset className="min-w-0">
          <legend className={labelClass}>Format</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {SCRIPT_FORMATS.map((f) => {
              const open = formats.includes(f.id);
              return (
                <label
                  key={f.id}
                  title={open ? f.hint : `Inclus avec ${formatsPlan}`}
                  className={cn(
                    'group relative flex min-h-[7.5rem] flex-col items-start justify-between gap-3 rounded-2xl border border-line bg-raised p-4 transition-[border-color,transform,box-shadow] duration-200',
                    open
                      ? 'cursor-pointer hover:-translate-y-0.5 hover:border-line-strong has-[:checked]:border-cyan-ink/60 has-[:checked]:bg-cyan-ink/[0.07] has-[:checked]:shadow-[0_0_30px_-14px_rgb(var(--cyan)/0.45)]'
                      : 'cursor-not-allowed opacity-55',
                    'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan',
                  )}
                >
                  <input
                    type="radio"
                    name="format"
                    value={f.id}
                    disabled={!open}
                    checked={format === f.id}
                    onChange={() => setFormat(f.id)}
                    className="peer sr-only"
                  />
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-ink/25 bg-cyan-ink/10 text-cyan-ink transition-colors peer-checked:border-transparent peer-checked:bg-[image:var(--gradient)] peer-checked:text-on-gradient">
                    <FormatIcon format={f.id} className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold leading-snug">{f.label}</span>
                  {open ? null : (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      {formatsPlan}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Réglages repliés : on voit les valeurs choisies sans les ouvrir. */}
        <details className="group/reglages rounded-2xl border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-4 w-4 text-cyan-ink" aria-hidden="true" />
            <span className="text-sm font-semibold">Réglages</span>
            <span className="num min-w-0 flex-1 truncate text-sm text-muted">
              {duration} s · {TONES.find((t) => t.id === tone)?.label} · {ANGLES.find((a) => a.id === angle)?.label}
            </span>
            <ChevronDown className="h-4 w-4 text-muted transition-transform group-open/reglages:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-5 border-t border-line px-4 pb-5 pt-4">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-muted">Durée</legend>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <Chip key={d} name="duree" value={String(d)} checked={duration === d} onChange={() => setDuration(d)} title={DURATION_HINTS[d]}>
                    <span className="num">{d} s</span>
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-muted">Ton</legend>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <Chip key={t.id} name="ton" value={t.id} checked={tone === t.id} onChange={() => setTone(t.id)} title={t.hint}>
                    {t.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-muted">Angle</legend>
              <div className="flex flex-wrap gap-2">
                {ANGLES.map((a) => (
                  <Chip key={a.id} name="angle" value={a.id} checked={angle === a.id} onChange={() => setAngle(a.id)} title={a.hint}>
                    {a.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>
        </details>

        <div className="flex flex-col gap-4 border-t border-line pt-8 sm:flex-row sm:items-center">
          <SubmitButton size="lg" pendingLabel="Écriture de tes scripts…" disabled={disabled || !product || !format} className="sm:min-w-64">
            Écrire mes scripts
          </SubmitButton>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <span>
              {unlimited
                ? remaining > 0
                  ? 'Écritures illimitées.'
                  : 'Limite de sécurité du jour atteinte.'
                : remaining > 0
                  ? `Il te reste ${remaining} écriture${remaining > 1 ? 's' : ''} aujourd’hui.`
                  : 'Plus d’écriture disponible aujourd’hui.'}
            </span>
            {style === 'actif' || style === 'inactif' || style === 'absent' ? (
              <Link href="/app/studio/style" className="inline-flex items-center gap-1.5 font-semibold text-fg hover:text-cyan-ink">
                <Fingerprint className="h-4 w-4 text-cyan-ink" aria-hidden="true" />
                {style === 'actif' ? 'Style perso actif' : style === 'inactif' ? 'Style perso en pause' : 'Créer mon style'}
              </Link>
            ) : null}
            {feedbackCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-cyan-ink" aria-hidden="true" />
                {feedbackCount} exemple{feedbackCount > 1 ? 's' : ''} de tes notes
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}
