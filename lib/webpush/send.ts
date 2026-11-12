import { vapidConfig, type VapidConfig } from './config';
import { encryptPushPayload, MAX_PLAINTEXT } from './encrypt';
import { vapidAuthorization } from './vapid';

/**
 * Envoi d'un message au service de push du navigateur (RFC 8030, 5) : POST sur l'adresse d'abonnement, corps chiffré
 * (RFC 8291), en-têtes TTL (obligatoire, en secondes), Content-Encoding: aes128gcm, Urgency et Authorization VAPID.
 * Réponses : 201 = accepté ; 404 ou 410 = abonnement expiré ou résilié (à supprimer) ; 413 = message trop gros ;
 * 429 = trop de messages.
 */
export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** Une notification du même tag remplace la précédente (récap du jour, par exemple). */
  tag?: string;
}

export interface PushSendResult {
  ok: boolean;
  status: number;
  /** L'abonnement n'existe plus chez le service de push : à supprimer. */
  gone: boolean;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: Uint8Array; signal?: AbortSignal }) => Promise<{ status: number }>;

/** Texte d'une notification : court (les services limitent le corps à 4 Ko), et coupé proprement au besoin. */
export function pushPlaintext(message: PushMessage): Buffer {
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const json = JSON.stringify({ title: cut(message.title, 120), body: cut(message.body, 600), url: message.url, tag: message.tag });
  const buffer = Buffer.from(json, 'utf8');
  if (buffer.length > MAX_PLAINTEXT) throw new Error('Notification trop longue.');
  return buffer;
}

export async function sendWebPush(
  target: PushTarget,
  message: PushMessage,
  options: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; config?: VapidConfig; fetchImpl?: FetchLike; now?: Date } = {},
): Promise<PushSendResult> {
  const config = options.config ?? vapidConfig();
  if (!config) return { ok: false, status: 0, gone: false };
  const body = encryptPushPayload(pushPlaintext(message), Buffer.from(target.keys.p256dh, 'base64url'), Buffer.from(target.keys.auth, 'base64url'));
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const response = await doFetch(target.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(options.ttlSeconds ?? 24 * 3600),
      Urgency: options.urgency ?? 'normal',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: vapidAuthorization(target.endpoint, config, options.now),
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: response.status >= 200 && response.status < 300, status: response.status, gone: response.status === 404 || response.status === 410 };
}
