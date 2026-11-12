import type { ReactNode } from 'react';

/** Champ à compléter par le fondateur, bien visible. */
export function Todo({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-warn-soft px-1 font-semibold text-warn">[À COMPLÉTER : {children}]</mark>;
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted">Dernière mise à jour : {updated}</p>
      <div className="legal mt-10 space-y-8 leading-relaxed [&_h2]:mb-3 [&_h2]:text-xl [&_li]:mt-1 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}
