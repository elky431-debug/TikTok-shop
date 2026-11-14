import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ProductImage } from '@/components/product/product-image';
import { cn, formatLongDate } from '@/lib/utils';
import { shiftMonth, STATUS_LABELS, type CalendarDay, type CalendarEntry } from '@/lib/v2/planning';

const WEEKDAYS = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
const DOT: Record<CalendarEntry['status'], string> = { a_tourner: 'bg-cyan-ink', tourne: 'bg-warn', poste: 'bg-gain' };

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`));

/**
 * Calendrier mensuel des vidéos prévues et postées. Grille lun. → dim. sur ordinateur (noms des produits), points de
 * couleur sur mobile, puis la liste des jours du mois en dessous (lisible sur un petit écran).
 */
export function MonthCalendar({
  month,
  weeks,
  today,
  hrefFor,
  images = {},
}: {
  month: string;
  weeks: CalendarDay[][];
  today: string;
  hrefFor: (month: string) => string;
  /** Image de chaque produit (identifiant → image, repli). */
  images?: Record<string, { src: string; fallback: string }>;
}) {
  const days = weeks.flat().filter((d) => d.inMonth && d.entries.length);
  return (
    <section aria-labelledby="calendrier-titre">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="calendrier-titre" className="text-lg first-letter:uppercase">
          {monthLabel(month)}
        </h2>
        <div className="flex gap-1">
          <Link href={hrefFor(shiftMonth(month, -1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-line hover:bg-surface" aria-label="Mois précédent">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href={hrefFor(today.slice(0, 7))} className="flex h-9 items-center rounded-full border border-line px-3 text-sm font-semibold hover:bg-surface">
            Aujourd’hui
          </Link>
          <Link href={hrefFor(shiftMonth(month, 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-line hover:bg-surface" aria-label="Mois suivant">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <table className="w-full table-fixed border-separate border-spacing-1 text-sm" aria-describedby="calendrier-legende">
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col" className="pb-1 text-xs font-medium text-muted">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].date}>
              {week.map((day) => (
                <td
                  key={day.date}
                  className={cn(
                    'h-14 rounded-xl border align-top sm:h-24',
                    day.inMonth ? 'border-line bg-raised' : 'border-transparent bg-transparent text-subtle',
                    day.date === today && 'border-cyan-ink/60',
                  )}
                  aria-label={`${formatLongDate(day.date)} : ${day.entries.length ? day.entries.map((e) => `vidéo n°${e.n} ${e.product}, ${STATUS_LABELS[e.status].toLowerCase()}`).join(' ; ') : 'rien de prévu'}`}
                >
                  <div className="flex h-full flex-col p-1 sm:p-1.5">
                    <span className={cn('num text-xs font-semibold', day.date === today && 'text-cyan-ink')} aria-hidden="true">
                      {Number(day.date.slice(8))}
                    </span>
                    {day.entries.length ? (
                      <>
                        <span className="mt-auto flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                          {day.entries.slice(0, 4).map((e) => (
                            <span key={`${e.planId}-${e.n}`} className={cn('h-1.5 w-1.5 rounded-full', DOT[e.status])} />
                          ))}
                        </span>
                        <ul className="mt-1 hidden space-y-0.5 sm:block" aria-hidden="true">
                          {day.entries.slice(0, 2).map((e) => (
                            <li key={`${e.planId}-${e.n}`} className="flex items-center gap-1 truncate text-[0.7rem] leading-tight">
                              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[e.status])} />
                              <span className="truncate">
                                n°{e.n} {e.product}
                              </span>
                            </li>
                          ))}
                          {day.entries.length > 2 ? <li className="text-[0.7rem] text-muted">+{day.entries.length - 2}</li> : null}
                        </ul>
                      </>
                    ) : null}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p id="calendrier-legende" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(Object.keys(DOT) as Array<CalendarEntry['status']>).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', DOT[s])} aria-hidden="true" />
            {STATUS_LABELS[s]}
          </span>
        ))}
      </p>

      <h3 className="mt-6 text-base">Ce mois-ci, jour par jour</h3>
      {days.length ? (
        <ol className="mt-2 divide-y divide-line rounded-2xl border border-line bg-raised">
          {days.map((day) => (
            <li key={day.date} className={cn('px-4 py-3', day.date === today && 'bg-cyan-ink/[0.05]')}>
              <p className="text-sm font-semibold first-letter:uppercase">
                {day.date === today ? 'Aujourd’hui' : formatLongDate(day.date)}
              </p>
              <ul className="mt-1 space-y-1">
                {day.entries.map((e) => (
                  <li key={`${e.planId}-${e.n}`} className="flex items-center gap-2 text-sm">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[e.status])} aria-hidden="true" />
                    {images[e.productId] ? <ProductImage src={images[e.productId].src} fallback={images[e.productId].fallback} alt="" className="h-7 w-7 self-center rounded-md" /> : null}
                    <Link href={`/app/mes-produits/${encodeURIComponent(e.productId)}`} className="min-w-0 truncate hover:underline">
                      Vidéo n°{e.n}/{e.total} · {e.product}
                    </Link>
                    <span className="ml-auto shrink-0 text-xs text-muted">{STATUS_LABELS[e.status]}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted">Rien de prévu ce mois-ci.</p>
      )}
    </section>
  );
}
