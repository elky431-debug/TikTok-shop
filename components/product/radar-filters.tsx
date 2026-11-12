'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { NICHES, type NicheId } from '@/lib/niches';
import { COMMISSION_STEPS, PRICE_BUCKETS, type RadarFilters } from '@/lib/radar-filters';
import { cn } from '@/lib/utils';

const selectClass =
  'h-10 rounded-full border border-line bg-raised pl-3.5 pr-8 text-sm font-medium text-fg hover:border-fg/30 focus:outline-none focus-visible:outline-2 focus-visible:outline-rose';

/** Filtres du radar : un formulaire GET classique, soumis automatiquement au changement. */
export function RadarFilterBar({ filters, niches }: { filters: RadarFilters; niches: NicheId[] }) {
  const router = useRouter();
  const available = niches.length ? NICHES.filter((n) => niches.includes(n.id)) : NICHES;
  const active = Object.keys(filters).length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of data.entries()) if (value) params.set(key, String(value));
    router.replace(params.size ? `/app?${params.toString()}` : '/app', { scroll: false });
  }

  return (
    <form
      method="get"
      action="/app"
      onSubmit={submit}
      onChange={(e) => e.currentTarget.requestSubmit()}
      className="scrollbar-none -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      aria-label="Filtrer les produits"
    >
      <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      {available.length > 1 ? (
        <select name="niche" defaultValue={filters.niche ?? ''} className={selectClass} aria-label="Niche">
          <option value="">Toutes mes niches</option>
          {available.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      ) : null}
      <select name="tendance" defaultValue={filters.tendance ?? ''} className={selectClass} aria-label="Tendance">
        <option value="">Toutes tendances</option>
        <option value="explose">Explose</option>
        <option value="monte">Monte</option>
        <option value="stable">Stable</option>
      </select>
      <select name="prix" defaultValue={filters.prix ?? ''} className={selectClass} aria-label="Prix">
        <option value="">Tous les prix</option>
        {PRICE_BUCKETS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
      <select name="commission" defaultValue={filters.commission ?? ''} className={selectClass} aria-label="Commission minimum">
        <option value="">Toute commission</option>
        {COMMISSION_STEPS.map((c) => (
          <option key={c} value={c}>
            {c}&nbsp;% et plus
          </option>
        ))}
      </select>
      <label
        className={cn(
          'relative inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-rose',
          filters.echantillon ? 'border-fg bg-fg text-bg' : 'border-line bg-raised hover:border-fg/30',
        )}
      >
        <input type="checkbox" name="echantillon" value="1" defaultChecked={filters.echantillon} className="sr-only" />
        Échantillon gratuit
      </label>
      {active ? (
        <Link
          href="/app"
          scroll={false}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted hover:text-fg"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Effacer
        </Link>
      ) : null}
      <noscript>
        <button type="submit" className={selectClass}>
          Filtrer
        </button>
      </noscript>
    </form>
  );
}
