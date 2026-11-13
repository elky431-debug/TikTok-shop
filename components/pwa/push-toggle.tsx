'use client';

import { Bell, BellOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ensureServiceWorker } from './service-worker';

type State =
  | { kind: 'loading' }
  | { kind: 'not-configured' }
  | { kind: 'unsupported'; ios: boolean }
  | { kind: 'denied' }
  | { kind: 'off' }
  | { kind: 'on'; endpoint: string };

/** Clé VAPID publique (base64url) → octets, pour `applicationServerKey`. */
function keyBytes(base64url: string): Uint8Array {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function supported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Bouton des notifications push de CET appareil. Consentement explicite : rien n'est demandé au chargement de la page,
 * la demande d'autorisation du navigateur ne part qu'au clic. Sans clés VAPID côté serveur, le bouton explique que ce
 * n'est pas encore activé.
 */
export function PushToggle({ publicKey, className }: { publicKey: string | null; className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!publicKey) return setState({ kind: 'not-configured' });
      if (!supported()) {
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        return setState({ kind: 'unsupported', ios });
      }
      if (Notification.permission === 'denied') return setState({ kind: 'denied' });
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setState(subscription && Notification.permission === 'granted' ? { kind: 'on', endpoint: subscription.endpoint } : { kind: 'off' });
    })().catch(() => !cancelled && setState({ kind: 'off' }));
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? { kind: 'denied' } : { kind: 'off' });
        return;
      }
      const registration = await ensureServiceWorker();
      if (!registration) throw new Error('Service worker indisponible.');
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const response = await fetch('/api/push/abonnement', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        await subscription.unsubscribe().catch(() => undefined);
        throw new Error(body.error ?? 'L’abonnement n’a pas pu être enregistré.');
      }
      setState({ kind: 'on', endpoint: subscription.endpoint });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Les notifications n’ont pas pu être activées. Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? (state.kind === 'on' ? state.endpoint : null);
      await subscription?.unsubscribe();
      if (endpoint) {
        await fetch('/api/push/abonnement', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint }) });
      }
      setState({ kind: 'off' });
      router.refresh();
    } catch {
      setError('La désactivation n’a pas abouti. Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      {state.kind === 'loading' ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Vérification de cet appareil…
        </p>
      ) : state.kind === 'not-configured' ? (
        <p className="text-sm text-muted">
          Les notifications push ne sont pas encore activées sur ce site. En attendant, tout arrive dans ce centre de notifications
          et par e-mail.
        </p>
      ) : state.kind === 'unsupported' ? (
        <p className="text-sm text-muted">
          {state.ios
            ? 'Sur iPhone et iPad, ajoute d’abord l’appli à ton écran d’accueil (bouton Partager, puis « Sur l’écran d’accueil »), ouvre-la depuis l’icône, puis reviens ici.'
            : 'Ce navigateur ne gère pas les notifications push. Essaie avec Chrome, Edge, Firefox ou Safari à jour.'}
        </p>
      ) : state.kind === 'denied' ? (
        <p className="text-sm text-muted">
          Tu as bloqué les notifications pour ce site. Pour les recevoir, autorise-les dans les réglages du navigateur (icône à
          gauche de l’adresse), puis recharge la page.
        </p>
      ) : state.kind === 'on' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-gain">
            <Bell className="h-4 w-4" aria-hidden="true" /> Notifications activées sur cet appareil
          </p>
          <Button variant="outline" size="sm" onClick={disable} disabled={busy} aria-busy={busy}>
            {busy ? <Spinner /> : <BellOff className="h-4 w-4" aria-hidden="true" />}
            Désactiver sur cet appareil
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button onClick={enable} disabled={busy} aria-busy={busy}>
            {busy ? <Spinner /> : <Bell className="h-4 w-4" aria-hidden="true" />}
            Activer les notifications sur cet appareil
          </Button>
          <p className="text-xs text-muted">Ton navigateur te demandera ton accord. Tu peux les couper à tout moment.</p>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-rose-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
