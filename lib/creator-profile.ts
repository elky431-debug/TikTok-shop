import type { Repo } from '@/lib/db';
import { env } from '@/lib/env';
import { checkNexscopeResponse } from '@/lib/data/nexscope';
import { ProviderClient, type RawResponse } from '@/lib/data/http';
import { parisDate } from '@/lib/utils';

/**
 * Chiffres publics du compte TikTok de l'utilisateur, lus chez Nexscope à partir du pseudo qu'il a saisi.
 *
 * Route documentée (www.nexscope.ai/api-docs/social-tiktok-profile, lue le 13 novembre 2026) :
 * `POST https://api.nexscope.ai/social/tiktok/profile`, corps `{ handle, cache_max_age }` (champs inconnus refusés),
 * 10 crédits par appel, 0 si Nexscope répond depuis son cache (`cache_max_age` : 1d). Réponse : `data.data.stats`
 * (`followerCount`, `heartCount`, `videoCount`) et `data.data.user` (`uniqueId`, `nickname`). On ne garde que ces
 * chiffres : ni photo (adresse signée qui expire), ni bio, ni liste d'abonnés.
 *
 * Au plus un appel par personne et par jour (fiche `profil_tiktok`, essai compté même en cas d'échec), jamais sans
 * pseudo ni sans clé. Un champ absent reste null.
 */
export const CREATOR_PROFILE_KIND = 'profil_tiktok';
export const NEXSCOPE_PROFILE_URL = 'https://api.nexscope.ai/social/tiktok/profile';

export interface CreatorProfile {
  handle: string;
  nickname: string | null;
  followers: number | null;
  likes: number | null;
  videos: number | null;
  /** AVAILABLE, PRIVATE, NOT_FOUND… (statut documenté) ; null si absent. */
  status: string | null;
  /** Dernier relevé réussi (ISO). null = jamais relevé. */
  fetched_at: string | null;
  /** Jour (Paris) du dernier essai, réussi ou non : un seul essai par jour. */
  attempted_on: string;
  /** Message du dernier échec, sans détail technique. */
  error: string | null;
}

/** Pseudo nettoyé : sans @, sans espace, caractères admis par TikTok (lettres, chiffres, point, tiret bas). */
export function cleanHandle(raw: string | null | undefined): string | null {
  const handle = String(raw ?? '').trim().replace(/^@+/, '');
  return /^[A-Za-z0-9._]{2,24}$/.test(handle) ? handle : null;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);

function findObject(json: unknown, key: string, depth = 0): Record<string, unknown> | null {
  if (!json || typeof json !== 'object' || depth > 4) return null;
  const obj = json as Record<string, unknown>;
  if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) return obj[key] as Record<string, unknown>;
  for (const value of Object.values(obj)) {
    const found = findObject(value, key, depth + 1);
    if (found) return found;
  }
  return null;
}

function findString(json: unknown, key: string, depth = 0): string | null {
  if (!json || typeof json !== 'object' || depth > 4) return null;
  const obj = json as Record<string, unknown>;
  if (typeof obj[key] === 'string') return obj[key] as string;
  for (const value of Object.values(obj)) {
    const found = findString(value, key, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Lit la réponse documentée ; null si les statistiques manquent (compte privé, introuvable…). */
export function mapTiktokProfile(json: unknown, handle: string): Pick<CreatorProfile, 'handle' | 'nickname' | 'followers' | 'likes' | 'videos' | 'status'> | null {
  const stats = findObject(json, 'stats');
  const user = findObject(json, 'user');
  const status = findString(json, 'resourceStatus');
  if (!stats) return null;
  return {
    handle: (typeof user?.uniqueId === 'string' && cleanHandle(user.uniqueId)) || handle,
    nickname: typeof user?.nickname === 'string' ? user.nickname.slice(0, 80) : null,
    followers: num(stats.followerCount),
    likes: num(stats.heartCount ?? stats.heart),
    videos: num(stats.videoCount),
    status,
  };
}

export async function getCreatorProfile(repo: Repo, userId: string): Promise<CreatorProfile | null> {
  const [record] = await repo.listRecords<CreatorProfile>(userId, CREATOR_PROFILE_KIND);
  return record?.data ?? null;
}

export function canRefreshCreator(current: CreatorProfile | null, handle: string | null, now = new Date()): boolean {
  if (!handle || !env.nexscopeApiKey) return false;
  if (!current || current.handle.toLowerCase() !== handle.toLowerCase()) return true;
  return current.attempted_on !== parisDate(now);
}

type Fetcher = (handle: string) => Promise<unknown>;

const nexscopeFetcher: Fetcher = (handle) => {
  const client = new ProviderClient({ provider: 'Nexscope', ratePerSecond: 2, maxCalls: 1, cacheTtlHours: 24, maxAttempts: 2 });
  const body = JSON.stringify({ handle, cache_max_age: '1d' });
  return client.request({
    url: NEXSCOPE_PROFILE_URL,
    method: 'POST',
    headers: { authorization: `Bearer ${env.nexscopeApiKey}`, 'content-type': 'application/json', accept: 'application/json' },
    body,
    cacheKey: `social-tiktok-profile|${body}`,
    timeoutMs: 20_000,
    parse: (response: RawResponse) => checkNexscopeResponse(response),
  });
};

/**
 * Relève le profil si la règle le permet (pseudo, clé, pas déjà essayé aujourd'hui). Renvoie la fiche à jour, ou
 * l'ancienne si rien n'a été appelé.
 */
export async function refreshCreatorProfile(
  repo: Repo,
  userId: string,
  rawHandle: string | null,
  options: { now?: Date; fetcher?: Fetcher } = {},
): Promise<CreatorProfile | null> {
  const now = options.now ?? new Date();
  const handle = cleanHandle(rawHandle);
  const [record] = await repo.listRecords<CreatorProfile>(userId, CREATOR_PROFILE_KIND);
  const current = record?.data ?? null;
  if (!canRefreshCreator(current, handle, now) || !handle) return current;

  const sameHandle = current && current.handle.toLowerCase() === handle.toLowerCase();
  const base: CreatorProfile = sameHandle
    ? { ...current, attempted_on: parisDate(now) }
    : { handle, nickname: null, followers: null, likes: null, videos: null, status: null, fetched_at: null, attempted_on: parisDate(now), error: null };
  // L'essai est compté avant l'appel : deux onglets ouverts ne paient pas deux fois.
  const saved = await repo.saveRecord<CreatorProfile>(userId, CREATOR_PROFILE_KIND, base, record?.id);
  let next: CreatorProfile;
  try {
    const json = await (options.fetcher ?? nexscopeFetcher)(handle);
    const mapped = mapTiktokProfile(json, handle);
    next = mapped
      ? { ...base, ...mapped, fetched_at: now.toISOString(), error: null }
      : { ...base, error: 'Profil introuvable ou privé : vérifie ton pseudo dans ton compte.' };
  } catch (error) {
    console.warn('[profil TikTok]', userId, error instanceof Error ? error.message : error);
    next = { ...base, error: 'Le relevé n’a pas abouti aujourd’hui. Nouvel essai demain.' };
  }
  await repo.saveRecord<CreatorProfile>(userId, CREATOR_PROFILE_KIND, next, saved.id);
  return next;
}
