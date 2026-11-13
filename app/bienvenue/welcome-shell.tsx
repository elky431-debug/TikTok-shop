import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { PageGlow } from '@/components/ui/page-glow';
import { WELCOME_STEPS } from '@/lib/onboarding';

/** Cadre commun du parcours de bienvenue : logo, étape en cours, barre de progression (6 étapes, ≈ 2 minutes). */
export function WelcomeShell({ step, children, wide = false }: { step: number; children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <PageGlow />
      <header className="relative flex items-center justify-between px-4 py-5 sm:px-8">
        <Logo href="/bienvenue" />
        <span className="num text-sm text-muted">
          Étape {step} sur {WELCOME_STEPS.length} · 2 min
        </span>
      </header>
      <main id="contenu" className={`relative mx-auto w-full flex-1 px-4 pb-16 ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <ol className="mb-8 grid grid-cols-6 gap-1.5" aria-label="Progression">
          {WELCOME_STEPS.map((label, i) => (
            <li key={label} className="min-w-0">
              <span className={`block h-1.5 rounded-full ${i < step ? 'bg-[image:var(--gradient)]' : 'bg-surface'}`} aria-hidden="true" />
              <span className={`mt-1.5 block truncate text-xs ${i + 1 === step ? 'font-semibold text-fg' : 'text-muted'}`}>
                {label}
                {i + 1 === step ? <span className="sr-only"> (étape en cours)</span> : null}
              </span>
            </li>
          ))}
        </ol>
        {children}
      </main>
    </div>
  );
}
