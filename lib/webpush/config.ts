/**
 * Clés VAPID (RFC 8292) des notifications push. Lues ici, pas dans lib/env.ts :
 * - VAPID_PUBLIC_KEY  : clé publique P-256 non compressée (65 octets), en base64url ;
 * - VAPID_PRIVATE_KEY : clé privée (32 octets), en base64url ;
 * - VAPID_SUBJECT     : adresse de contact « mailto:… » ou « https://… » (RFC 8292, 2.1).
 * Générer une paire : `node scripts/vapid-keys.mjs`. Sans les trois, le push est désactivé et le bouton l'explique.
 */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function read(name: string): string {
  return (process.env[name] ?? '').trim();
}

const B64URL = /^[A-Za-z0-9_-]+$/;

function decodedLength(value: string): number {
  return B64URL.test(value) ? Buffer.from(value, 'base64url').length : -1;
}

/** Problèmes de configuration (vide = tout va bien, ou rien n'est configuré). */
export function vapidProblems(): string[] {
  const publicKey = read('VAPID_PUBLIC_KEY');
  const privateKey = read('VAPID_PRIVATE_KEY');
  const subject = read('VAPID_SUBJECT');
  if (!publicKey && !privateKey && !subject) return [];
  const problems: string[] = [];
  if (decodedLength(publicKey) !== 65 || Buffer.from(publicKey, 'base64url')[0] !== 0x04) {
    problems.push('VAPID_PUBLIC_KEY doit être une clé P-256 non compressée de 65 octets, en base64url.');
  }
  if (decodedLength(privateKey) !== 32) problems.push('VAPID_PRIVATE_KEY doit faire 32 octets, en base64url.');
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) problems.push('VAPID_SUBJECT doit commencer par « mailto: » ou « https:// ».');
  return problems;
}

export function vapidConfig(): VapidConfig | null {
  const publicKey = read('VAPID_PUBLIC_KEY');
  const privateKey = read('VAPID_PRIVATE_KEY');
  const subject = read('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject || vapidProblems().length) return null;
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return vapidConfig() !== null;
}

/** Clé publique à donner au navigateur (`applicationServerKey`), ou null si le push n'est pas configuré. */
export function vapidPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}
