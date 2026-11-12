import { headers } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Adresse publique par laquelle l'utilisateur est arrivé (local, adresse Netlify, domaine), pour que les liens de
 * connexion et les retours de Google le ramènent au même endroit. Une adresse inconnue (en-tête Host trafiqué) n'est
 * jamais utilisée : on retombe sur NEXT_PUBLIC_SITE_URL. Les adresses connues sont aussi celles autorisées chez Supabase
 * (`npm run auth:setup`).
 */
export function knownOrigins(): string[] {
  const list = [
    env.siteUrl,
    process.env.URL, // Netlify : adresse principale du site
    process.env.DEPLOY_PRIME_URL, // Netlify : adresse du déploiement en cours
    ...(process.env.AUTH_REDIRECT_ORIGINS ?? '').split(','),
    'http://localhost:3000',
  ];
  return [...new Set(list.map((o) => (o ?? '').trim().replace(/\/$/, '')).filter((o) => /^https?:\/\/[^/]+$/.test(o)))];
}

export function originFrom(host: string | null, proto: string | null): string | null {
  if (!host) return null;
  const scheme = proto === 'http' || proto === 'https' ? proto : host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  return `${scheme}://${host}`.replace(/\/$/, '');
}

export function requestOrigin(): string {
  const h = headers();
  const origin = originFrom(h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? null);
  return origin && knownOrigins().includes(origin) ? origin : env.siteUrl.replace(/\/$/, '');
}
