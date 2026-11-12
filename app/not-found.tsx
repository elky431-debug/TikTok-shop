import { Logo } from '@/components/brand/logo';
import { LinkButton } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>
      <main id="contenu" className="mx-auto flex max-w-md flex-1 flex-col items-start justify-center px-4 pb-24">
        <p className="num text-7xl font-bold text-subtle">404</p>
        <h1 className="mt-4 text-3xl">Cette page n’existe pas</h1>
        <p className="mt-2 text-muted">Le lien est peut-être ancien, ou le produit a quitté le radar.</p>
        <div className="mt-8 flex gap-2">
          <LinkButton href="/app">Ouvrir mon radar</LinkButton>
          <LinkButton href="/" variant="ghost">
            Accueil
          </LinkButton>
        </div>
      </main>
    </div>
  );
}
