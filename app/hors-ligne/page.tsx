import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { OfflinePages, RetryButton } from '@/components/pwa/offline-pages';
import { PageGlow } from '@/components/ui/page-glow';

export const metadata: Metadata = { title: 'Hors ligne', robots: { index: false } };
// Page statique : le service worker la garde dès l'installation pour l'afficher sans réseau.
export const dynamic = 'force-static';

export default function HorsLignePage() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <PageGlow />
      <header className="relative px-4 py-5 sm:px-8">
        <Logo href="/app" />
      </header>
      <main id="contenu" className="relative mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-8">
        <span className="icon-chip" aria-hidden="true">
          <WifiOff className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-3xl">Tu es hors ligne</h1>
        <p className="mt-2 text-muted">
          Pas de réseau pour l’instant. Les pages que tu as déjà ouvertes restent lisibles, telles que tu les as vues la dernière
          fois. Les produits du jour, les scripts et les réglages reviennent dès que la connexion revient.
        </p>
        <RetryButton />
        <OfflinePages />
      </main>
    </div>
  );
}
