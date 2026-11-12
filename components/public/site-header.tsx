import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { LinkButton } from '@/components/ui/button';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Navigation du site" className="flex items-center gap-1 text-sm font-semibold">
          <Link href="/prix" className="hidden rounded-full px-3 py-2 text-muted hover:text-fg sm:inline-block">
            Prix
          </Link>
          <Link href="/formateurs" className="hidden rounded-full px-3 py-2 text-muted hover:text-fg sm:inline-block">
            Formateurs
          </Link>
          <Link href="/connexion" className="rounded-full px-3 py-2 text-muted hover:text-fg">
            Connexion
          </Link>
          <LinkButton href="/connexion" size="sm" className="ml-1">
            Commencer
          </LinkButton>
        </nav>
      </div>
    </header>
  );
}
