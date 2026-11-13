'use client';

import type { ReactNode } from 'react';

/** Demande au service worker d'effacer les pages gardées hors ligne et l'abonnement push de cet appareil. */
export function forgetThisDevice() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'oublier-compte' });
  } catch {
    // pas de service worker : rien à effacer
  }
}

/**
 * Formulaire de suppression du compte : à l'envoi, l'appareil oublie aussi le compte (pages hors ligne, push), car la
 * redirection d'une action serveur ne passe pas toujours par le service worker.
 */
export function ForgetDeviceForm({ action, className, children }: { action: (formData: FormData) => void | Promise<void>; className?: string; children: ReactNode }) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(event) => {
        const confirmation = new FormData(event.currentTarget).get('confirmation');
        if (String(confirmation ?? '').trim().toUpperCase() === 'SUPPRIMER') forgetThisDevice();
      }}
    >
      {children}
    </form>
  );
}
