import { getRepo } from '@/lib/db';

/** Durées de cache des appels vidéo (en heures). */
export const CACHE_TTL_HOURS = { oembed: 12, details: 24 } as const;

/**
 * Réponse JSON gardée en base (table provider_cache, ou fichier local) : un même lien collé dix fois ne coûte qu'un
 * appel. Si la base ne répond pas, l'appel se fait quand même.
 */
export async function cachedJson<T>(key: string, ttlHours: number, load: () => Promise<T>): Promise<T> {
  const repo = getRepo();
  const hit = await repo.getProviderCache(key).catch(() => null);
  if (hit !== null && hit !== undefined) return hit as T;
  const value = await load();
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000).toISOString();
  await repo.setProviderCache(key, value, expiresAt).catch(() => undefined);
  return value;
}
