'use client';

import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { NICHES, type NicheId } from '@/lib/niches';
import { BADGES } from '@/lib/radar/badges';
import { COMMISSION_STEPS, PRICE_BUCKETS, RATING_STEPS, type FilterAvailability, type RadarFilters } from '@/lib/radar-filters';
import { cn } from '@/lib/utils';

const selectClass =
  'h-10 rounded-xl border border-line-strong bg-surface pl-3.5 pr-8 text-sm font-medium text-fg hover:border-cyan-ink/30 focus:outline-none focus-visible:outline-2 focus-visible:outline-cyan';
const inputClass =
  'num h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-subtle focus:border-cyan-ink/50 focus:outline-none focus-visible:outline-2 focus-visible:outline-cyan';

const ADVANCED: Array<keyof RadarFilters> = [
  'souscat',
  'prixMin',
  'prixMax',
  'commissionEuros',
  'ventes7',
  'ventes30',
  'croissance',
  'affiliesMin',
  'affiliesMax',
  'note',
  'avis',
  'nouveau',
  'badge',
];

function NumberField({
  name,
  label,
  value,
  placeholder,
  step = '1',
  suffix,
}: {
  name: string;
  label: string;
  value: number | undefined;
  placeholder?: string;
  step?: string;
  suffix?: string;
}) {
  const id = `filtre-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type="number"
          inputMode="decimal"
          step={step}
          defaultValue={value ?? ''}
          placeholder={placeholder}
          className={cn(inputClass, suffix && 'pr-8')}
        />
        {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span> : null}
      </div>
    </div>
  );
}

/**
 * Filtres du radar : un formulaire GET classique. Les listes se soumettent au changement ; les champs chiffrés avec
 * « Appliquer » (ou Entrée). Un filtre dont aucun produit du jour n'a la donnée n'est pas affiché.
 */
export function RadarFilterBar({
  filters,
  niches,
  availability,
}: {
  filters: RadarFilters;
  niches: NicheId[];
  availability: FilterAvailability;
}) {
  const router = useRouter();
  const available = niches.length ? NICHES.filter((n) => niches.includes(n.id)) : NICHES;
  const active = Object.keys(filters).length;
  const advancedActive = ADVANCED.filter((k) => filters[k] !== undefined).length;
  const [open, setOpen] = useState(advancedActive > 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of data.entries()) if (value) params.set(key, String(value));
    router.replace(params.size ? `/app?${params.toString()}` : '/app', { scroll: false });
  }

  const autoSubmit = (event: ChangeEvent<HTMLSelectElement | HTMLInputElement>) => event.currentTarget.form?.requestSubmit();

  return (
    <form method="get" action="/app" onSubmit={submit} aria-label="Filtrer les produits">
      <div className="scrollbar-none -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        {available.length > 1 ? (
          <select name="niche" defaultValue={filters.niche ?? ''} onChange={autoSubmit} className={selectClass} aria-label="Niche">
            <option value="">Toutes mes niches</option>
            {available.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        ) : null}
        <select name="tendance" defaultValue={filters.tendance ?? ''} onChange={autoSubmit} className={selectClass} aria-label="Tendance">
          <option value="">Toutes tendances</option>
          <option value="explose">Explose</option>
          <option value="monte">Monte</option>
          <option value="stable">Stable</option>
        </select>
        <select name="prix" defaultValue={filters.prix ?? ''} onChange={autoSubmit} className={selectClass} aria-label="Prix">
          <option value="">Tous les prix</option>
          {PRICE_BUCKETS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <select name="commission" defaultValue={filters.commission ?? ''} onChange={autoSubmit} className={selectClass} aria-label="Commission minimum">
          <option value="">Toute commission</option>
          {COMMISSION_STEPS.map((c) => (
            <option key={c} value={c}>
              {c}&nbsp;% et plus
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="filtres-avances"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-sm font-semibold text-fg hover:bg-surface"
        >
          Plus de filtres
          {advancedActive ? <span className="num rounded-full bg-cyan-soft px-1.5 text-xs text-cyan-ink">{advancedActive}</span> : null}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
        {active ? (
          <Link
            href="/app"
            scroll={false}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-muted hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Effacer
          </Link>
        ) : null}
      </div>

      <div id="filtres-avances" hidden={!open} className="mt-3 rounded-2xl border border-line bg-raised p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {availability.subcategories.length ? (
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="filtre-souscat" className="mb-1 block text-xs font-semibold text-muted">
                Sous-catégorie
              </label>
              <select id="filtre-souscat" name="souscat" defaultValue={filters.souscat ?? ''} onChange={autoSubmit} className={cn(selectClass, 'w-full')}>
                <option value="">Toutes</option>
                {availability.subcategories.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <NumberField name="prixmin" label="Prix minimum" value={filters.prixMin} step="0.01" suffix="€" />
          <NumberField name="prixmax" label="Prix maximum" value={filters.prixMax} step="0.01" suffix="€" />
          <NumberField name="comeur" label="Commission par vente, au moins" value={filters.commissionEuros} step="0.01" suffix="€" />
          {availability.sales7 ? <NumberField name="v7" label="Ventes sur 7 jours, au moins" value={filters.ventes7} /> : null}
          {availability.sales30 ? <NumberField name="v30" label="Ventes sur 30 jours, au moins" value={filters.ventes30} /> : null}
          {availability.growth ? <NumberField name="croissance" label="Croissance 7 jours, au moins" value={filters.croissance} suffix="%" /> : null}
          {availability.affiliates ? (
            <>
              <NumberField name="affmin" label="Affiliés, au moins" value={filters.affiliesMin} />
              <NumberField name="affmax" label="Affiliés, au plus" value={filters.affiliesMax} />
            </>
          ) : null}
          {availability.rating ? (
            <div>
              <label htmlFor="filtre-note" className="mb-1 block text-xs font-semibold text-muted">
                Note
              </label>
              <select id="filtre-note" name="note" defaultValue={filters.note ?? ''} onChange={autoSubmit} className={cn(selectClass, 'w-full')}>
                <option value="">Toutes</option>
                {RATING_STEPS.map((n) => (
                  <option key={n} value={n}>
                    {String(n).replace('.', ',')} et plus
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {availability.reviews ? <NumberField name="avis" label="Avis, au moins" value={filters.avis} /> : null}
          {availability.badges.length ? (
            <div>
              <label htmlFor="filtre-badge" className="mb-1 block text-xs font-semibold text-muted">
                Signal
              </label>
              <select id="filtre-badge" name="badge" defaultValue={filters.badge ?? ''} onChange={autoSubmit} className={cn(selectClass, 'w-full')}>
                <option value="">Tous</option>
                {availability.badges.map((b) => (
                  <option key={b} value={b}>
                    {BADGES[b].label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {availability.newProducts ? (
            <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm font-medium sm:col-span-1">
              <input type="checkbox" name="nouveau" value="1" defaultChecked={filters.nouveau} onChange={autoSubmit} className="h-4 w-4 accent-[#25F4EE]" />
              Lancés depuis moins de 30 jours
            </label>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-xs text-muted">
            Un produit dont la source ne donne pas la donnée filtrée est écarté. Les filtres sans aucune donnée aujourd’hui ne sont pas proposés.
          </p>
          <button type="submit" className="inline-flex h-10 items-center rounded-xl bg-fg px-5 text-sm font-semibold text-bg hover:bg-fg/90">
            Appliquer
          </button>
        </div>
      </div>
      <noscript>
        <button type="submit" className={selectClass}>
          Filtrer
        </button>
      </noscript>
    </form>
  );
}
