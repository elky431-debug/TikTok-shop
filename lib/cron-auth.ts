import { env, isLocalMode } from '@/lib/env';

/**
 * Vérifie l'en-tête « Authorization: Bearer <CRON_SECRET> » (envoyé automatiquement par Vercel Cron).
 * Sans secret configuré, seul le mode local est autorisé.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return isLocalMode();
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}
