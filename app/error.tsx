'use client';

import { useEffect } from 'react';
import { Button, LinkButton } from '@/components/ui/button';

/** Erreur inattendue : message clair, sans excuses, avec une action. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="contenu" className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-start justify-center px-4 py-16">
      <h1 className="text-3xl">La page n’a pas pu se charger</h1>
      <p className="mt-2 text-muted">
        Un problème technique a interrompu l’affichage. Tes données ne sont pas perdues.
        {error.digest ? <span className="mt-2 block text-xs">Référence : {error.digest}</span> : null}
      </p>
      <div className="mt-8 flex gap-2">
        <Button onClick={reset}>Recharger la page</Button>
        <LinkButton href="/app" variant="ghost">
          Retour au radar
        </LinkButton>
      </div>
    </main>
  );
}
