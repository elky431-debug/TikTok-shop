import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Session du mode local : cookie « charge.signature » signé en HMAC-SHA256.
 * N'est jamais utilisé quand Supabase est configuré.
 */

export interface LocalSessionPayload {
  uid: string;
  email: string;
  exp: number; // secondes epoch
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function sign(data: string): string {
  return createHmac('sha256', env.localAuthSecret).update(data).digest('base64url');
}

export function createLocalSessionToken(user: { id: string; email: string }, days = 30): string {
  const payload: LocalSessionPayload = {
    uid: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + days * 86_400,
  };
  const data = b64url(JSON.stringify(payload));
  return `${data}.${sign(data)}`;
}

export function verifyLocalSessionToken(token: string | undefined | null): LocalSessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as LocalSessionPayload;
    if (!payload.uid || !payload.email || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
