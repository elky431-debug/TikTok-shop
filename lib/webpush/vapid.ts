import { createPrivateKey, sign } from 'node:crypto';
import type { VapidConfig } from './config';

/**
 * Identification du serveur auprès du service de push (RFC 8292, VAPID) : un jeton JWT signé en ES256 (ECDSA P-256 +
 * SHA-256, signature brute r || s de 64 octets, RFC 7515/7518), envoyé avec la clé publique dans l'en-tête
 *   Authorization: vapid t=<jeton>, k=<clé publique en base64url>
 * Contenu du jeton : `aud` = origine du service de push (schéma + hôte de l'adresse d'abonnement), `exp` = expiration
 * (24 h au plus après l'envoi ; 12 h ici), `sub` = contact (mailto: ou https:).
 */
const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

export function vapidPrivateKeyObject(config: Pick<VapidConfig, 'publicKey' | 'privateKey'>) {
  const pub = Buffer.from(config.publicKey, 'base64url');
  return createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: config.privateKey, x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
    format: 'jwk',
  });
}

export function vapidJwt(endpoint: string, config: VapidConfig, now = new Date(), lifetimeSeconds = 12 * 3600): string {
  const { protocol, host } = new URL(endpoint);
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({ aud: `${protocol}//${host}`, exp: Math.floor(now.getTime() / 1000) + lifetimeSeconds, sub: config.subject }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: vapidPrivateKeyObject(config), dsaEncoding: 'ieee-p1363' });
  return `${header}.${claims}.${b64url(signature)}`;
}

export function vapidAuthorization(endpoint: string, config: VapidConfig, now = new Date()): string {
  return `vapid t=${vapidJwt(endpoint, config, now)}, k=${config.publicKey}`;
}
