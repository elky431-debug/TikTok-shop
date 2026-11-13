'use client';

import { ArrowLeft, ArrowRight, ExternalLink, GripVertical } from 'lucide-react';
import { useEffect, useRef, useState, useTransition, type DragEvent, type KeyboardEvent } from 'react';
import { moveVideoAction, savePostedDetailsAction } from '@/app/app/mes-produits/actions';
import { Input } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn, formatCompact, formatInt, formatShortDate } from '@/lib/utils';
import { PLAN_STATUSES, STATUS_LABELS, type PlanItem, type PlanItemStatus } from '@/lib/v2/planning';

const HINTS: Record<PlanItemStatus, string> = {
  a_tourner: 'Les vidéos qui restent à filmer.',
  tourne: 'Filmées, pas encore en ligne.',
  poste: 'En ligne : note le lien, les vues et les ventes.',
};

/**
 * Tableau des vidéos d'un produit : trois colonnes (à tourner, tourné, posté).
 * - Ordinateur : glisser-déposer (HTML5) ; au clavier, flèches gauche et droite sur une carte pour changer de colonne.
 * - Mobile : une colonne à la fois (onglets) et des boutons sur chaque carte.
 * Chaque déplacement est enregistré par une action serveur ; en cas d'échec, la carte revient à sa place.
 */
export function VideoBoard({
  productId,
  productName,
  items: initial,
  today,
  openVideo,
}: {
  productId: string;
  productName: string;
  items: PlanItem[];
  today: string;
  /** Vidéo dont le formulaire de détails est ouvert au chargement. */
  openVideo?: number;
}) {
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<PlanItemStatus>(() => initial.find((i) => i.n === openVideo)?.status ?? 'a_tourner');
  const [over, setOver] = useState<PlanItemStatus | null>(null);
  const [announce, setAnnounce] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const focusRef = useRef<number | null>(null);

  // Les données du serveur reviennent après chaque enregistrement : on les reprend.
  useEffect(() => setItems(initial), [initial]);

  useEffect(() => {
    if (focusRef.current === null) return;
    const card = document.querySelector<HTMLElement>(`[data-video-card="${focusRef.current}"]`);
    focusRef.current = null;
    card?.focus();
  }, [items]);

  function move(n: number, status: PlanItemStatus, keepFocus = false) {
    const before = items;
    const item = before.find((i) => i.n === n);
    if (!item || item.status === status) return;
    setError(null);
    if (keepFocus) focusRef.current = n;
    setItems(before.map((i) => (i.n === n ? { ...i, status, posted_at: status === 'poste' ? (i.posted_at ?? today) : i.posted_at } : i)));
    setAnnounce(`Vidéo n°${n} déplacée dans « ${STATUS_LABELS[status]} ».`);
    startTransition(async () => {
      const result = await moveVideoAction(productId, n, status).catch(() => ({ ok: false as const, message: 'Connexion perdue : réessaie.' }));
      if (result.ok) {
        if (keepFocus) focusRef.current = n;
        setItems(result.items);
      } else {
        setItems(before);
        setError(result.message);
        setAnnounce(`Échec : ${result.message}`);
      }
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>, item: PlanItem) {
    const index = PLAN_STATUSES.indexOf(item.status);
    if (event.key === 'ArrowRight' && index < PLAN_STATUSES.length - 1) {
      event.preventDefault();
      move(item.n, PLAN_STATUSES[index + 1], true);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      move(item.n, PLAN_STATUSES[index - 1], true);
    }
  }

  function onDrop(event: DragEvent<HTMLElement>, status: PlanItemStatus) {
    event.preventDefault();
    setOver(null);
    const n = Number(event.dataTransfer.getData('text/plain'));
    if (Number.isInteger(n) && n > 0) move(n, status);
  }

  const counts = Object.fromEntries(PLAN_STATUSES.map((s) => [s, items.filter((i) => i.status === s).length])) as Record<PlanItemStatus, number>;

  return (
    <div aria-busy={pending}>
      <p id="aide-tableau" className="sr-only">
        Sur une carte, flèche droite pour l’avancer d’une colonne, flèche gauche pour la reculer. Sur ordinateur, tu peux aussi la glisser.
      </p>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {error ? (
        <p role="alert" className="mb-3 rounded-xl border border-rose/30 bg-rose-soft px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {/* Mobile : une colonne à la fois */}
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-surface p-1 lg:hidden" role="group" aria-label="Colonne affichée">
        {PLAN_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={tab === status}
            onClick={() => setTab(status)}
            className={cn('h-10 rounded-lg text-sm font-semibold transition-colors', tab === status ? 'bg-raised text-fg shadow' : 'text-muted')}
          >
            {STATUS_LABELS[status]} <span className="num text-muted">{counts[status]}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {PLAN_STATUSES.map((status) => {
          const column = items.filter((i) => i.status === status);
          return (
            <section
              key={status}
              aria-labelledby={`colonne-${status}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (over !== status) setOver(status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(e) => onDrop(e, status)}
              className={cn(
                'rounded-2xl border bg-raised p-3 transition-colors lg:block',
                tab === status ? 'block' : 'hidden',
                over === status ? 'border-cyan-ink/60 bg-cyan-ink/[0.04]' : 'border-line',
              )}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <h3 id={`colonne-${status}`} className="text-base">
                  {STATUS_LABELS[status]}
                </h3>
                <span className="num text-sm font-semibold text-muted">{counts[status]}</span>
              </div>
              <p className="mb-3 px-1 text-xs text-muted">{HINTS[status]}</p>
              {column.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
                  {status === 'poste' ? 'Glisse ici tes vidéos en ligne.' : 'Aucune vidéo ici.'}
                </p>
              ) : (
                <ol className="space-y-2">
                  {column.map((item) => (
                    <li key={item.n} id={`video-${item.n}`}>
                      <Card item={item} productId={productId} productName={productName} open={openVideo === item.n} onMove={move} onKeyDown={onKeyDown} />
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Card({
  item,
  productId,
  productName,
  open,
  onMove,
  onKeyDown,
}: {
  item: PlanItem;
  productId: string;
  productName: string;
  open: boolean;
  onMove: (n: number, status: PlanItemStatus, keepFocus?: boolean) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>, item: PlanItem) => void;
}) {
  const index = PLAN_STATUSES.indexOf(item.status);
  const previous = index > 0 ? PLAN_STATUSES[index - 1] : null;
  const next = index < PLAN_STATUSES.length - 1 ? PLAN_STATUSES[index + 1] : null;
  const when =
    item.status === 'poste' && item.posted_at
      ? `postée le ${formatShortDate(item.posted_at)}`
      : item.date
        ? `prévue le ${formatShortDate(item.date)}`
        : null;
  return (
    <div
      data-video-card={item.n}
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(item.n));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget) onKeyDown(e, item);
      }}
      aria-label={`Vidéo n°${item.n}, ${STATUS_LABELS[item.status].toLowerCase()}${when ? `, ${when}` : ''}`}
      aria-describedby="aide-tableau"
      className="group rounded-xl border border-line bg-surface p-3 text-sm outline-none transition-colors hover:border-line-strong focus-visible:border-cyan-ink/60 lg:cursor-grab lg:active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 hidden h-4 w-4 shrink-0 text-subtle lg:block" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            Vidéo n°<span className="num">{item.n}</span>
          </p>
          {when ? <p className="text-xs text-muted">{when}</p> : null}
          {item.status === 'poste' && (item.views != null || item.sales != null || item.url) ? (
            <p className="num mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {item.views != null ? <span>{formatCompact(item.views)} vues</span> : null}
              {item.sales != null ? <span className="text-gain">{formatInt(item.sales)} ventes</span> : null}
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-cyan-ink hover:underline">
                  Voir <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  <span className="sr-only">la vidéo n°{item.n} (nouvel onglet)</span>
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      {/* Mobile : boutons à la place du glisser-déposer */}
      <div className="mt-2 flex flex-wrap gap-2 lg:hidden">
        {previous ? (
          <button
            type="button"
            onClick={() => onMove(item.n, previous)}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-3 text-xs font-semibold text-muted hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {STATUS_LABELS[previous]}
            <span className="sr-only"> : vidéo n°{item.n}</span>
          </button>
        ) : null}
        {next ? (
          <button
            type="button"
            onClick={() => onMove(item.n, next)}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-fg px-3 text-xs font-semibold text-bg"
          >
            {STATUS_LABELS[next]}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only"> : vidéo n°{item.n}</span>
          </button>
        ) : null}
      </div>

      {item.status === 'poste' ? (
        <details className="mt-2" open={open}>
          <summary className="cursor-pointer text-xs font-semibold text-cyan-ink">Lien, date, vues et ventes</summary>
          <form action={savePostedDetailsAction} className="mt-2 grid grid-cols-2 gap-2">
            <input type="hidden" name="produit" value={productId} />
            <input type="hidden" name="n" value={item.n} />
            <label className="col-span-2 text-xs font-semibold">
              Lien de la vidéo
              <Input name="lien" type="url" inputMode="url" defaultValue={item.url ?? ''} placeholder="https://www.tiktok.com/@…" className="mt-1 h-10 text-sm" />
            </label>
            <label className="col-span-2 text-xs font-semibold">
              Date de publication
              <Input name="date" type="date" defaultValue={item.posted_at ?? ''} className="mt-1 h-10 text-sm" />
            </label>
            <label className="text-xs font-semibold">
              Vues
              <Input name="vues" type="number" min={0} inputMode="numeric" defaultValue={item.views ?? ''} className="num mt-1 h-10 text-sm" />
            </label>
            <label className="text-xs font-semibold">
              Ventes
              <Input name="ventes" type="number" min={0} inputMode="numeric" defaultValue={item.sales ?? ''} className="num mt-1 h-10 text-sm" />
            </label>
            <SubmitButton size="sm" variant="outline" className="col-span-2" pendingLabel="Enregistrement…">
              Enregistrer les chiffres
            </SubmitButton>
            <p className="col-span-2 text-[0.7rem] text-muted">Chiffres saisis par toi, pour {productName.slice(0, 40)}. Rien n’est lu sur ton compte TikTok.</p>
          </form>
        </details>
      ) : null}
    </div>
  );
}
