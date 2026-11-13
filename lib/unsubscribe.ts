import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Liens de désinscription en un clic, sans connexion : jeton HMAC-SHA256 lié à l'utilisateur ET à la liste.
 * Clé : APP_SIGNING_SECRET, sinon CRON_SECRET, sinon le secret du mode local, dérivée pour cet usage seulement.
 * Un jeton ne coupe qu'une liste d'e-mails : il ne donne accès à rien d'autre.
 *
 * Listes :
 * - `matin`      : récap du matin (profil.digest_email) — jeton historique (HMAC de l'identifiant seul), pour que les
 *                  liens des e-mails déjà envoyés restent valables ;
 * - `dimanche`   : récap du dimanche ;
 * - `conseils`   : e-mails d'accompagnement (bienvenue, astuce, rappel, réactivation) ;
 * - `abonnement` : e-mails sur l'abonnement (fin d'essai, relance de paiement).
 */
export const UNSUBSCRIBE_LISTS = ['matin', 'dimanche', 'conseils', 'abonnement'] as const;
export type UnsubscribeList = (typeof UNSUBSCRIBE_LISTS)[number];

export function isUnsubscribeList(value: unknown): value is UnsubscribeList {
  return (UNSUBSCRIBE_LISTS as readonly unknown[]).includes(value);
}

/** Liste lue dans l'adresse : absente = récap du matin (anciens liens). */
export function parseUnsubscribeList(value: string | null | undefined): UnsubscribeList | null {
  if (value === null || value === undefined || value === '') return 'matin';
  return isUnsubscribeList(value) ? value : null;
}

function key(): Buffer {
  const base = process.env.APP_SIGNING_SECRET?.trim() || env.cronSecret || env.localAuthSecret;
  return createHash('sha256').update(`desinscription-recap:${base}`).digest();
}

export function unsubscribeToken(userId: string, list: UnsubscribeList = 'matin'): string {
  return createHmac('sha256', key())
    .update(list === 'matin' ? userId : `${list}:${userId}`)
    .digest('base64url');
}

export function verifyUnsubscribeToken(userId: string, token: string, list: UnsubscribeList = 'matin'): boolean {
  if (!userId || !token) return false;
  const expected = Buffer.from(unsubscribeToken(userId, list));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Adresse de la page (lien visible dans l'e-mail) et de l'action en un clic (en-tête List-Unsubscribe). */
export function unsubscribeUrls(userId: string, siteUrl: string = env.siteUrl, list: UnsubscribeList = 'matin') {
  const query = `u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId, list)}${list === 'matin' ? '' : `&l=${list}`}`;
  return { page: `${siteUrl}/desinscription?${query}`, oneClick: `${siteUrl}/api/recap/desinscription?${query}` };
}

/** En-têtes RFC 8058 d'un e-mail de la liste (doc Resend : List-Unsubscribe + List-Unsubscribe-Post). */
export function unsubscribeHeaders(userId: string, list: UnsubscribeList, siteUrl: string = env.siteUrl): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrls(userId, siteUrl, list).oneClick}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
