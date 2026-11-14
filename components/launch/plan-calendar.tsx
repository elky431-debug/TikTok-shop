'use client';

import { GripVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moveVideoDateAction } from '@/app/app/lancer/actions';
import { cn } from '@/lib/utils';

export interface CalendarVideo {
  n: number;
  date: string | null;
  status: 'a_tourner' | 'tourne' | 'poste';
  script: string | null;
}

const WEEKDAYS = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
/** Numéro du jour (avec le mois le 1er) : en-tête de case sur téléphone. */
const dayNumber = (date: string) => (date.endsWith('-01') ? shortDay(date) : String(Number(date.slice(8))));
const shortDay = (date: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

/**
 * Calendrier des vidéos d'un lancement, semaine par semaine. Une vidéo se déplace en la glissant sur un autre jour
 * (ordinateur), ou en la touchant puis en touchant le jour voulu (téléphone, clavier). Les vidéos postées restent à leur
 * date ; rien ne se place avant aujourd'hui.
 */
export function PlanCalendar({ launchId, videos, weeks, today }: { launchId: string; videos: CalendarVideo[]; weeks: string[][]; today: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(videos);

  function move(n: number, date: string) {
    const video = local.find((v) => v.n === n);
    if (!video || video.status === 'poste' || date < today || video.date === date) return;
    setLocal((all) => all.map((v) => (v.n === n ? { ...v, date } : v)));
    setSelected(null);
    setMessage(`Vidéo n°${n} déplacée au ${dayLabel(date)}.`);
    startTransition(async () => {
      const result = await moveVideoDateAction(launchId, n, date);
      if (!result.ok) {
        setLocal(videos);
        setMessage(`La vidéo n°${n} n’a pas pu être déplacée.`);
      }
      router.refresh();
    });
  }

  const byDay = new Map<string, CalendarVideo[]>();
  for (const v of local) if (v.date) byDay.set(v.date, [...(byDay.get(v.date) ?? []), v]);

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        {selected !== null ? (
          <span className="font-semibold text-fg">Vidéo n°{selected} choisie : touche le jour où la mettre.</span>
        ) : (
          'Glisse une vidéo sur un autre jour, ou touche-la puis touche le jour voulu.'
        )}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
      <div className={cn(pending && 'opacity-80')}>
        {/* 7 colonnes à toutes les tailles : sur téléphone, numéro du jour seul et puces compactes. */}
        <table className="w-full table-fixed border-separate border-spacing-0.5 text-sm sm:border-spacing-1">
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th key={d} scope="col" className="pb-1 text-[11px] font-medium text-muted sm:text-xs">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]}>
                {week.map((day) => {
                  const past = day < today;
                  const items = byDay.get(day) ?? [];
                  const canDrop = !past && (selected !== null || dragging !== null);
                  return (
                    <td
                      key={day}
                      onDragOver={(e) => {
                        if (past || dragging === null) return;
                        e.preventDefault();
                        setOver(day);
                      }}
                      onDragLeave={() => setOver((o) => (o === day ? null : o))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setOver(null);
                        const n = Number(e.dataTransfer.getData('text/plain'));
                        if (n) move(n, day);
                        setDragging(null);
                      }}
                      className={cn(
                        'h-16 rounded-lg border align-top transition-colors sm:h-24 sm:rounded-xl',
                        past ? 'border-transparent bg-fg/[0.02] text-subtle' : 'border-line bg-raised',
                        day === today && 'border-cyan-ink/60',
                        over === day && 'border-cyan-ink bg-cyan-ink/[0.08]',
                      )}
                    >
                      <div className="flex h-full flex-col gap-1 p-0.5 sm:p-1.5">
                        {canDrop && selected !== null ? (
                          <button
                            type="button"
                            onClick={() => move(selected, day)}
                            className="num rounded-md text-left text-[11px] font-semibold text-cyan-ink underline-offset-2 hover:underline sm:text-xs"
                            aria-label={`Mettre la vidéo n°${selected} le ${dayLabel(day)}`}
                          >
                            <span className="sm:hidden">{dayNumber(day)} ici</span>
                            <span className="hidden sm:inline">{shortDay(day)} · ici</span>
                          </button>
                        ) : (
                          <span className={cn('num text-[11px] font-semibold sm:text-xs', day === today ? 'text-cyan-ink' : 'text-muted')}>
                            <span className="sm:hidden">{dayNumber(day)}</span>
                            <span className="hidden sm:inline">{shortDay(day)}</span>
                          </span>
                        )}
                        {items.map((v) => (
                          <button
                            key={v.n}
                            type="button"
                            draggable={v.status !== 'poste'}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', String(v.n));
                              e.dataTransfer.effectAllowed = 'move';
                              setDragging(v.n);
                            }}
                            onDragEnd={() => setDragging(null)}
                            onClick={() => v.status !== 'poste' && setSelected((s) => (s === v.n ? null : v.n))}
                            aria-pressed={selected === v.n}
                            aria-label={`Vidéo n°${v.n}${v.script ? ` (${v.script})` : ''}, ${dayLabel(day)}${v.status === 'poste' ? ', en ligne' : ' : la choisir pour la déplacer'}`}
                            className={cn(
                              'flex w-full cursor-grab items-center gap-1 truncate rounded-md px-1 py-0.5 text-left text-[11px] font-semibold active:cursor-grabbing sm:rounded-lg sm:px-1.5 sm:py-1 sm:text-xs',
                              v.status === 'poste'
                                ? 'cursor-default bg-gain-soft text-gain'
                                : v.status === 'tourne'
                                  ? 'bg-warn-soft text-warn'
                                  : 'bg-cyan-ink/[0.1] text-cyan-ink',
                              selected === v.n && 'ring-2 ring-cyan-ink',
                            )}
                          >
                            {v.status !== 'poste' ? <GripVertical className="hidden h-3 w-3 shrink-0 sm:block" aria-hidden="true" /> : null}
                            <span className="truncate">n°{v.n}</span>
                          </button>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cyan-ink" aria-hidden="true" /> À tourner
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warn" aria-hidden="true" /> Tournée
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-gain" aria-hidden="true" /> En ligne
        </span>
      </p>
    </div>
  );
}
