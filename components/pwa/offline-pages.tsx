'use client';

import { RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Nom lisible d'une page gardée hors ligne. */
export function offlinePageLabel(path: string): string {
  const [pathname] = path.split('?');
  const fixed: Record<string, string> = {
    '/': 'Accueil',
    '/app': 'Produits du jour',
    '/app/studio': 'Studio de scripts',
    '/app/mes-produits': 'Mes produits',
    '/app/lancer': 'Lancer un produit',
    '/app/recap': 'Récap',
    '/app/plan': 'Plan de publication',
    '/app/notifications': 'Notifications',
    '/app/compte': 'Mon compte',
    '/prix': 'Prix',
  };
  if (fixed[pathname]) return fixed[pathname];
  if (pathname.startsWith('/app/produit/')) return 'Fiche produit';
  if (pathname.startsWith('/app/studio/')) return 'Script écrit';
  return pathname;
}

export function RetryButton() {
  return (
    <Button className="mt-6" onClick={() => window.location.reload()}>
      <RotateCw className="h-4 w-4" aria-hidden="true" />
      Réessayer
    </Button>
  );
}

/** Pages gardées par le service worker sur cet appareil (cache « pages-… »). */
export function OfflinePages() {
  const [pages, setPages] = useState<string[] | null>(null);
  useEffect(() => {
    if (!('caches' in window)) return setPages([]);
    (async () => {
      const names = (await caches.keys()).filter((n) => n.startsWith('pages-'));
      const urls = new Set<string>();
      for (const name of names) {
        for (const request of await (await caches.open(name)).keys()) {
          const url = new URL(request.url);
          urls.add(url.pathname + url.search);
        }
      }
      setPages([...urls].sort());
    })().catch(() => setPages([]));
  }, []);

  if (!pages?.length) return null;
  return (
    <section aria-labelledby="pages-hors-ligne" className="mt-8">
      <h2 id="pages-hors-ligne" className="text-lg">
        Disponibles sans réseau
      </h2>
      <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-raised">
        {pages.map((path) => (
          <li key={path}>
            <a href={path} className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold hover:bg-surface">
              <span>{offlinePageLabel(path)}</span>
              <span className="truncate text-xs font-normal text-muted">{path}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
