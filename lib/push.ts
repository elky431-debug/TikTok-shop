import { isPushConfigured } from '@/lib/webpush/config';
import { webPushSender } from '@/lib/webpush/subscriptions';

/**
 * Notifications push web (bloc 15). Point d'entrée unique : `sendPush`. Envoi par Web Push (RFC 8030, chiffrement
 * RFC 8291, identification VAPID RFC 8292) vers chaque appareil que l'utilisateur a abonné lui-même (bouton
 * « Activer les notifications », jamais au chargement). Sans clés VAPID, ou sans appareil abonné, ne fait rien et
 * renvoie false.
 */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** Une notification du même tag remplace la précédente sur l'appareil. */
  tag?: string;
}

type PushSender = (userId: string, payload: PushPayload) => Promise<boolean>;
let sender: PushSender | null = null;

/** Remplace l'envoi (tests) ; null revient à l'envoi Web Push par défaut. */
export function registerPushSender(fn: PushSender | null) {
  sender = fn;
}

function activeSender(): PushSender | null {
  if (sender) return sender;
  return isPushConfigured() ? (userId, payload) => webPushSender(userId, payload) : null;
}

export async function sendPush(userId: string, payload: PushPayload): Promise<boolean> {
  const send = activeSender();
  if (!send) return false;
  try {
    return await send(userId, payload);
  } catch (error) {
    console.warn('[push]', userId, error instanceof Error ? error.message : error);
    return false;
  }
}
