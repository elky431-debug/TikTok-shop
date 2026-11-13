'use client';

import { ArrowDownWideNarrow, ArrowUpNarrowWide, Download, LayoutGrid, Rows3 } from 'lucide-react';
import { saveRadarPrefsAction } from '@/app/app/actions';
import { SORT_LABELS, type RadarView, type SortKey, type SortOrder } from '@/lib/radar/sort';
import { cn } from '@/lib/utils';

const pill = 'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors';

/**
 * Vue (cartes ou liste) et tri du radar, mémorisés pour l'utilisateur (fiche de réglages) par une action serveur :
 * rien n'est enregistré sans un geste de sa part.
 */
export function RadarToolbar({
  view,
  sort,
  order,
  sorts,
  query,
  count,
  exportHref,
  labels = {},
}: {
  view: RadarView;
  sort: SortKey;
  order: SortOrder;
  /** Colonnes proposées (celles qui ont des données ; « pour toi » à partir de Pro). */
  sorts: SortKey[];
  /** Filtres en cours (paramètres d'adresse), gardés au retour. */
  query: string;
  count: number;
  /** Lien d'export CSV (Elite), null sinon. */
  exportHref: string | null;
  /** Libellés propres à ce plan (« Classement du jour » quand le score est masqué). */
  labels?: Partial<Record<SortKey, string>>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="num text-sm text-muted">{count > 1 ? `${count} produits` : `${count} produit`}</p>
      <div className="flex flex-wrap items-center gap-2">
        <form action={saveRadarPrefsAction} className="flex items-center gap-1.5">
          <input type="hidden" name="retour" value={query} />
          <label htmlFor="radar-tri" className="sr-only">
            Trier par
          </label>
          <select
            id="radar-tri"
            name="tri"
            defaultValue={sort}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-9 rounded-lg border border-line-strong bg-surface pl-3 pr-8 text-sm font-medium text-fg focus:outline-none focus-visible:outline-2 focus-visible:outline-cyan"
          >
            {sorts.map((key) => (
              <option key={key} value={key}>
                Tri : {labels[key] ?? SORT_LABELS[key]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            name="ordre"
            value={order === 'asc' ? 'desc' : 'asc'}
            className={cn(pill, 'border border-line-strong px-2.5 text-muted hover:text-fg')}
            aria-label={order === 'asc' ? 'Ordre croissant : passer en décroissant' : 'Ordre décroissant : passer en croissant'}
          >
            {order === 'asc' ? <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" /> : <ArrowDownWideNarrow className="h-4 w-4" aria-hidden="true" />}
          </button>
          <noscript>
            <button type="submit" className={cn(pill, 'border border-line-strong')}>
              Trier
            </button>
          </noscript>
        </form>
        <form action={saveRadarPrefsAction} className="flex rounded-lg border border-line-strong p-0.5" aria-label="Affichage">
          <input type="hidden" name="retour" value={query} />
          <button
            type="submit"
            name="vue"
            value="cartes"
            aria-pressed={view === 'cartes'}
            className={cn(pill, 'h-8 px-2.5', view === 'cartes' ? 'bg-surface text-fg' : 'text-muted hover:text-fg')}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            Cartes
          </button>
          <button
            type="submit"
            name="vue"
            value="liste"
            aria-pressed={view === 'liste'}
            className={cn(pill, 'h-8 px-2.5', view === 'liste' ? 'bg-surface text-fg' : 'text-muted hover:text-fg')}
          >
            <Rows3 className="h-4 w-4" aria-hidden="true" />
            Liste
          </button>
        </form>
        {exportHref ? (
          <a href={exportHref} className={cn(pill, 'border border-line-strong text-fg hover:bg-surface')} download>
            <Download className="h-4 w-4" aria-hidden="true" />
            Exporter en CSV
          </a>
        ) : null}
      </div>
    </div>
  );
}
