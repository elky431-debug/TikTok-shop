import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Lien de désinscription du récap en un clic, sans connexion : jeton HMAC-SHA256 lié à l'utilisateur.
 * Clé : APP_SIGNING_SECRET, sinon CRON_SECRET, sinon le secret du mode local, dérivée pour cet usage seulement.
 * Le jeton ne sert qu'à couper le récap par e-mail : il ne donne accès à rien d'autre.
 */
function key(): Buffer {
  const base = process.env.APP_SIGNING_SECRET?.trim() || env.cronSecret || env.localAuthSecret;
  return createHash('sha256').update(`desinscription-recap:${base}`).digest();
}

export function unsubscribeToken(userId: string): string {
  return createHmac('sha256', key()).update(userId).digest('base64url');
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  if (!userId || !token) return false;
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Adresse de la page (lien visible dans l'e-mail) et de l'action en un clic (en-tête List-Unsubscribe). */
export function unsubscribeUrls(userId: string, siteUrl: string = env.siteUrl) {
  const query = `u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
  return { page: `${siteUrl}/desinscription?${query}`, oneClick: `${siteUrl}/api/recap/desinscription?${query}` };
}
