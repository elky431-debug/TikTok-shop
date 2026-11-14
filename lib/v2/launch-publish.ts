import { repoCache } from '@/lib/data';
import { NexscopeProvider } from '@/lib/data/nexscope';
import type { Repo } from '@/lib/db';
import { env } from '@/lib/env';
import { cachedJson, CACHE_TTL_HOURS } from '@/lib/tiktok/cache';
import { fetchOEmbed, isShortTikTokLink, parseTikTokLink, resolveShortLink, type OEmbedResult, type TikTokLink } from '@/lib/tiktok/video';
import { parisDate } from '@/lib/utils';

/**
 * Lien d'une vidéo publiée, collé à l'étape « Publier » : c'est lui qui dit à l'appli que la vidéo est en ligne (TikTok
 * n'ouvre pas son API aux affiliés en Europe). On lit l'identifiant (lien complet, ou lien court résolu), on confirme
 * que la vidéo existe avec l'oEmbed officiel, puis on prend ses chiffres publics chez la source documentée quand elle
 * les a. Tout est gardé en cache ; en mode local (tests compris), aucun appel extérieur.
 */
export type PublishCheck =
  | { ok: true; link: TikTokLink; views: number | null; sales: number | null }
  | { ok: false; reason: 'lien' | 'court' | 'introuvable' };

/** Recherches de chiffres par compte et par jour (même limite que l'aperçu de l'analyse). */
const DAILY_LOOKUPS = 40;

async function allowLookup(repo: Repo, userId: string): Promise<boolean> {
  const key = `apercu-video|${userId}|${parisDate()}`;
  const used = Number((await repo.getProviderCache(key).catch(() => 0)) ?? 0) || 0;
  if (used >= DAILY_LOOKUPS) return false;
  await repo.setProviderCache(key, used + 1, new Date(Date.now() + 36 * 3_600_000).toISOString()).catch(() => undefined);
  return true;
}

export async function checkPublishedLink(raw: string, opts: { repo: Repo; userId: string; offline: boolean }): Promise<PublishCheck> {
  const text = raw.trim().slice(0, 500);
  let link = parseTikTokLink(text);
  if (!link && isShortTikTokLink(text)) {
    if (opts.offline) return { ok: false, reason: 'court' };
    link = await resolveShortLink(text).catch(() => null);
    if (!link) return { ok: false, reason: 'court' };
  }
  if (!link) return { ok: false, reason: 'lien' };
  if (opts.offline) return { ok: true, link, views: null, sales: null };

  const oembed = await cachedJson<OEmbedResult>(`oembed|${link.id}`, CACHE_TTL_HOURS.oembed, () => fetchOEmbed(link!)).catch(
    (): OEmbedResult => ({ ok: false, reason: 'indisponible' }),
  );
  if (!oembed.ok && oembed.reason === 'introuvable') return { ok: false, reason: 'introuvable' };

  let views: number | null = null;
  let sales: number | null = null;
  if (env.nexscopeApiKey && (await allowLookup(opts.repo, opts.userId))) {
    try {
      const facts = await new NexscopeProvider({ cache: repoCache() }).fetchVideoDetail(link.id);
      views = facts?.views ?? null;
      sales = facts?.sales ?? null;
    } catch (error) {
      console.warn('[publication] chiffres de la vidéo', error instanceof Error ? error.message : error);
    }
  }
  return { ok: true, link, views, sales };
}
