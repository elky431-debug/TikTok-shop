import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { PageGlow } from '@/components/ui/page-glow';

/** Coquille légère des espaces formateur et admin (hors de l'appli principale). */
export function SimpleShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <PageGlow />
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/app" />
            <span className="hidden text-sm font-semibold text-muted sm:inline">{title}</span>
          </div>
          <nav className="flex items-center gap-1 text-sm font-semibold">
            <Link href="/app" className="rounded-full px-3 py-1.5 text-muted hover:bg-surface hover:text-fg">
              Retour à l’appli
            </Link>
            <form action="/auth/deconnexion" method="post">
              <button type="submit" className="rounded-full px-3 py-1.5 text-muted hover:bg-surface hover:text-fg">
                Me déconnecter
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main id="contenu" className="relative mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        {children}
      </main>
    </div>
  );
}
