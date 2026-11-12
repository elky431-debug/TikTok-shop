import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Mots de passe du mode local seulement (avec Supabase, c'est Supabase Auth qui les garde) : scrypt de Node, sel
 * aléatoire, comparaison en temps constant. Format « sel:empreinte » en hexadécimal.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  const [saltHex, hashHex] = (stored ?? '').split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Message d'erreur en français, ou null si le mot de passe convient. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Choisis un mot de passe d’au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  if (password.length > 72) return 'Ton mot de passe est trop long (72 caractères au plus).';
  return null;
}
