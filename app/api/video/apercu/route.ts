import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/session';
import { repoCache } from '@/lib/data';
import { NexscopeProvider, type VideoFacts } from '@/lib/data/nexscope';
import { getRepo } from '@/lib/db';
import { env } from '@/lib/env';
import { getPlan } from '@/lib/plans';
import { fetchOEmbed, isShortTikTokLink, parseTikTokLink, playerUrl, resolveShortLink } from '@/lib/tiktok/video';
import { parisDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Recherches de légende et de chiffres par compte et par jour (aperçus ; une même vidéo reste en cache 24 h). */
const DAILY_LOOKUPS = 40;

export interface VideoPreview {
  ok: true;
  id: string;
  url: string;
  /** Lecteur officiel TikTok (vidéo, auteur, légende). */
  player: string;
  facts: (Pick<VideoFacts, 'author' | 'cover_url' | 'duration_s' | 'views' | 'likes' | 'sales' | 'published_at'> & { caption: string }) | null;
}
export type VideoPreviewResponse = VideoPreview | { ok: false; message: string };

function reply(body: VideoPreviewResponse, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}

/** Compte les recherches du jour ; false au-delà de la limite. */
async function allowLookup(userId: string): Promise<boolean> {
  const repo = getRepo();
  const key = `apercu-video|${userId}|${parisDate()}`;
  const used = Number((await repo.getProviderCache(key).catch(() => 0)) ?? 0) || 0;
  if (used >= DAILY_LOOKUPS) return false;
  await repo.setProviderCache(key, used + 1, new Date(Date.now() + 36 * 3_600_000).toISOString()).catch(() => undefined);
  return true;
}

/**
 * Aperçu d'une vidéo collée dans l'analyse : identifiant (lien complet, ou lien court résolu), existence confirmée par
 * l'oEmbed officiel, lecteur officiel, puis légende et chiffres chez Nexscope (en cache, mêmes données que l'analyse).
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return reply({ ok: false, message: 'Connecte-toi pour voir l’aperçu.' }, 401);
  if (!getPlan(viewer.profile.plan).analysesPerMonth) return reply({ ok: false, message: 'L’analyse de vidéo est incluse dans Pro.' }, 403);

  const raw = (new URL(request.url).searchParams.get('lien') ?? '').slice(0, 500);
  const short = isShortTikTokLink(raw);
  const link = parseTikTokLink(raw) ?? (short ? await resolveShortLink(raw) : null);
  if (!link) {
    return reply({
      ok: false,
      message: short ? 'Lien court illisible : ouvre la vidéo dans TikTok et copie son lien complet.' : 'Ce n’est pas le lien d’une vidéo TikTok.',
    });
  }
  const oembed = await fetchOEmbed(link);
  if (!oembed.ok && oembed.reason === 'introuvable') {
    return reply({ ok: false, message: 'Vidéo introuvable chez TikTok : elle est peut-être privée ou supprimée.' });
  }

  let facts: VideoFacts | null = null;
  if (env.nexscopeApiKey && (await allowLookup(viewer.profile.id))) {
    try {
      facts = await new NexscopeProvider({ cache: repoCache() }).fetchVideoDetail(link.id);
    } catch (error) {
      console.warn('[aperçu vidéo] Nexscope', error instanceof Error ? error.message : error);
    }
  }
  return reply({
    ok: true,
    id: link.id,
    url: link.url,
    player: playerUrl(link.id),
    facts: facts
      ? {
          author: facts.author ?? null,
          caption: facts.description.slice(0, 400),
          cover_url: facts.cover_url ?? null,
          duration_s: facts.duration_s,
          views: facts.views,
          likes: facts.likes,
          sales: facts.sales,
          published_at: facts.published_at,
        }
      : null,
  });
}
