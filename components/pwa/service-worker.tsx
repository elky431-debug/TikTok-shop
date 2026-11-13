'use client';

import { useEffect } from 'react';

export const SERVICE_WORKER_URL = '/sw.js';

/** Enregistre le service worker (ou renvoie celui déjà en place). */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
  return navigator.serviceWorker.ready;
}

/**
 * Service worker de l'appli installable : pages déjà vues gardées hors ligne, page hors ligne, notifications push.
 * Enregistré après le chargement, en production seulement (en développement, les fichiers changent sans changer
 * d'adresse : le bouton des notifications l'enregistre au besoin pour tester le push).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' }).catch((error) => {
        console.warn('[service worker] enregistrement impossible', error);
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
