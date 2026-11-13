import { getRepo, type Repo } from '@/lib/db';
import type { PushPayload } from '@/lib/push';
import { isPushConfigured } from './config';
import { sendWebPush, type PushSendResult, type PushTarget } from './send';

/**
 * Abonnements push d'un utilisateur : une fiche `push_abonnement` par appareil (navigateur), créée seulement après un
 * clic sur « Activer les notifications » et l'accord du navigateur. Rien n'est demandé au chargement d'une page.
 */
export const PUSH_KIND = 'push_abonnement';

export interface StoredPushSubscription extends PushTarget {
  expiration_time: number | null;
  /** Navigateur, pour reconnaître l'appareil dans le compte (« Chrome sur Android »…). */
  device: string;
}

/**
 * Services de push des navigateurs (Chrome, Edge, Firefox, Safari, Samsung, Opera, Brave). L'adresse d'abonnement vient
 * du navigateur : on refuse toute autre destination, pour que le serveur ne puisse pas être utilisé pour appeler une
 * adresse arbitraire.
 */
const PUSH_HOST_SUFFIXES = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.port &&
      PUSH_HOST_SUFFIXES.some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`))
    );
  } catch {
    return false;
  }
}

/** Nom lisible de l'appareil, d'après l'en-tête User-Agent (aucune empreinte, juste un libellé). */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  return os ? `${browser} sur ${os}` : browser;
}

export type ParsedSubscription = { ok: true; value: Omit<StoredPushSubscription, 'device'> } | { ok: false; error: string };

/** Vérifie l'objet renvoyé par `PushSubscription.toJSON()` (endpoint, expirationTime, keys.p256dh, keys.auth). */
export function parseSubscription(input: unknown): ParsedSubscription {
  const raw = (input ?? {}) as { endpoint?: unknown; expirationTime?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint : '';
  const p256dh = typeof raw.keys?.p256dh === 'string' ? raw.keys.p256dh : '';
  const auth = typeof raw.keys?.auth === 'string' ? raw.keys.auth : '';
  if (!endpoint || endpoint.length > 2000 || !isAllowedPushEndpoint(endpoint)) {
    return { ok: false, error: 'Ce navigateur utilise un service de notifications inconnu.' };
  }
  const key = /^[A-Za-z0-9_-]+$/.test(p256dh) ? Buffer.from(p256dh, 'base64url') : Buffer.alloc(0);
  if (key.length !== 65 || key[0] !== 0x04) return { ok: false, error: 'Clé de chiffrement du navigateur invalide.' };
  if (!/^[A-Za-z0-9_-]+$/.test(auth) || Buffer.from(auth, 'base64url').length !== 16) return { ok: false, error: 'Secret du navigateur invalide.' };
  const expiration = typeof raw.expirationTime === 'number' && Number.isFinite(raw.expirationTime) ? raw.expirationTime : null;
  return { ok: true, value: { endpoint, keys: { p256dh, auth }, expiration_time: expiration } };
}

export async function listPushSubscriptions(userId: string, repo: Repo = getRepo()) {
  return repo.listRecords<StoredPushSubscription>(userId, PUSH_KIND);
}

/**
 * Enregistre l'abonnement de cet appareil. Une même adresse ne vaut que pour un seul compte : si quelqu'un d'autre s'était
 * abonné sur ce navigateur (appareil partagé), son abonnement est retiré, pour ne jamais lui envoyer les notifications
 * d'un autre.
 */
export async function savePushSubscription(userId: string, subscription: Omit<StoredPushSubscription, 'device'>, userAgent: string | null, repo: Repo = getRepo()) {
  for (const other of await repo.listAllRecords<StoredPushSubscription>(PUSH_KIND)) {
    if (other.data.endpoint === subscription.endpoint && other.user_id !== userId) await repo.deleteRecord(other.user_id, other.id);
  }
  const mine = await listPushSubscriptions(userId, repo);
  const same = mine.find((r) => r.data.endpoint === subscription.endpoint);
  // Dix appareils au plus : le plus ancien laisse sa place.
  if (!same && mine.length >= 10) await repo.deleteRecord(userId, mine[mine.length - 1].id);
  return repo.saveRecord(userId, PUSH_KIND, { ...subscription, device: deviceLabel(userAgent) }, same?.id);
}

export async function removePushSubscription(userId: string, endpoint: string, repo: Repo = getRepo()): Promise<boolean> {
  const record = (await listPushSubscriptions(userId, repo)).find((r) => r.data.endpoint === endpoint);
  if (!record) return false;
  await repo.deleteRecord(userId, record.id);
  return true;
}

/**
 * Envoie la notification à tous les appareils abonnés de l'utilisateur. Un abonnement expiré (404, 410) est supprimé.
 * Renvoie true si au moins un appareil l'a reçue.
 */
export async function webPushSender(userId: string, payload: PushPayload, repo: Repo = getRepo(), send: typeof sendWebPush = sendWebPush): Promise<boolean> {
  if (!isPushConfigured() && send === sendWebPush) return false;
  let delivered = false;
  for (const record of await listPushSubscriptions(userId, repo)) {
    let result: PushSendResult;
    try {
      result = await send(record.data, { title: payload.title, body: payload.body, url: payload.url, tag: payload.tag });
    } catch (error) {
      console.warn('[push] envoi', userId, error instanceof Error ? error.message : error);
      continue;
    }
    if (result.gone) await repo.deleteRecord(userId, record.id);
    else if (result.ok) delivered = true;
    else console.warn('[push] refusé par le service', userId, result.status);
  }
  return delivered;
}
