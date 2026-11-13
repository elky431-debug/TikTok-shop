import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn, formatInt, formatShortDate } from '@/lib/utils';

/** Onglets de l'administration. */
export function AdminNav({ current }: { current: 'apercu' | 'utilisateurs' | 'formateurs' }) {
  const tabs = [
    { id: 'apercu', href: '/admin', label: 'Aperçu' },
    { id: 'utilisateurs', href: '/admin/utilisateurs', label: 'Utilisateurs' },
    { id: 'formateurs', href: '/admin/formateurs', label: 'Formateurs et versements' },
  ] as const;
  return (
    <nav aria-label="Sections de l’administration" className="scrollbar-none -mx-4 mb-6 flex gap-1 overflow-x-auto px-4 text-sm font-semibold sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === current ? 'page' : undefined}
          className={cn('whitespace-nowrap rounded-full px-3.5 py-1.5', t.id === current ? 'bg-surface text-fg' : 'text-muted hover:text-fg')}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Section({ id, title, children, aside }: { id: string; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-titre`} className="text-xl">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, gain }: { label: string; value: string; hint?: string; gain?: boolean }) {
  return (
    <div className="bg-raised p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn('num mt-1 text-2xl font-semibold', gain && 'text-gain')}>{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

/** Barres verticales simples (une par jour), avec la valeur exacte lisible au survol et par les lecteurs d'écran. */
export function DayBars({ data, label }: { data: Array<{ day: string; value: number }>; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <div className="flex h-28 items-end gap-1" aria-hidden="true">
        {data.map((d) => (
          <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${formatShortDate(d.day)} : ${formatInt(d.value)}`}>
            <div className="rounded-t bg-[image:var(--gradient)] opacity-90" style={{ height: `${Math.max(d.value > 0 ? 4 : 1, (d.value / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted" aria-hidden="true">
        <span>{data[0] ? formatShortDate(data[0].day) : ''}</span>
        <span>{data.at(-1) ? formatShortDate(data.at(-1)!.day) : ''}</span>
      </div>
      <figcaption className="sr-only">
        {label} : {data.map((d) => `${formatShortDate(d.day)} ${d.value}`).join(', ')}
      </figcaption>
    </figure>
  );
}
