import { CACHE_TTL_HOURS, cachedJson } from './cache';

/**
 * Vidéos TikTok, seulement par les voies officielles (aucun scraping, aucune connexion à un compte) :
 *  - le lien est lu sur place (identifiant après /video/, /player/v1/ ou /v/) ; un lien court de partage
 *    (vm.tiktok.com, vt.tiktok.com, tiktok.com/t/) est résolu en lisant l'en-tête de redirection, sans lire la page ;
 *  - l'API oEmbed officielle (https://www.tiktok.com/oembed?url=…) confirme que la vidéo existe et est publique. Depuis
 *    octobre 2026, sa réponse ne contient plus que le lecteur intégrable (`embed_product_id`, `html`) : ni titre, ni
 *    auteur, ni miniature (doc « Embed Videos », mise à jour du 23 octobre 2026, et vraie réponse du 14 novembre) ;
 *  - l'aperçu (miniature animée, auteur, légende) est donc le lecteur officiel « Embed Player »
 *    (https://www.tiktok.com/player/v1/{id}?description=1), affiché tel quel ;
 *  - le texte et les chiffres viennent de Nexscope (`/et/batchVideoDetail`, documenté, 10 crédits, en cache).
 */

export interface TikTokLink {
  /** Identifiant numérique de la vidéo. */
  id: string;
  /** Adresse complète de la vidéo (celle que l'oEmbed accepte). */
  url: string;
}

const VIDEO_HOSTS = /(^|\.)tiktok\.com$/i;
const SHORT_HOSTS = /^(vm|vt)\.tiktok\.com$/i;

function toUrl(input: string): URL | null {
  const raw = input.trim().replace(/^<|>$/g, '');
  // Lien collé avec du texte autour (« Regarde cette vidéo https://vm.tiktok.com/… ») : on garde l'adresse.
  const found = /https?:\/\/\S+/i.exec(raw)?.[0] ?? (/^[\w.-]*tiktok\.com\//i.test(raw) ? `https://${raw}` : null);
  if (!found) return null;
  try {
    return new URL(found.replace(/[)\].,;!?»”"']+$/, ''));
  } catch {
    return null;
  }
}

/** Identifiant d'une vidéo dans un lien complet, null sinon (lien court, profil, autre site). */
export function parseTikTokLink(input: string): TikTokLink | null {
  const url = toUrl(input);
  if (!url || !VIDEO_HOSTS.test(url.hostname) || SHORT_HOSTS.test(url.hostname)) return null;
  const id =
    /\/video\/(\d{8,25})/.exec(url.pathname)?.[1] ??
    /\/player\/v1\/(\d{8,25})/.exec(url.pathname)?.[1] ??
    /\/embed(?:\/v2)?\/(\d{8,25})/.exec(url.pathname)?.[1] ??
    /^\/v\/(\d{8,25})/.exec(url.pathname)?.[1] ??
    null;
  if (!id) return null;
  const user = /^\/(@[\w.-]+)\//.exec(url.pathname)?.[1] ?? '@_';
  return { id, url: `https://www.tiktok.com/${user}/video/${id}` };
}

/** Lien court de partage (vm.tiktok.com/…, vt.tiktok.com/…, tiktok.com/t/…) à résoudre. */
export function isShortTikTokLink(input: string): boolean {
  const url = toUrl(input);
  if (!url) return false;
  return SHORT_HOSTS.test(url.hostname) || (VIDEO_HOSTS.test(url.hostname) && /^\/t\/[\w-]+/.test(url.pathname));
}

/** Lecteur officiel (Embed Player) : la vidéo, son auteur et sa légende, servis par TikTok. */
export function playerUrl(id: string): string {
  return `https://www.tiktok.com/player/v1/${id}?description=1&music_info=0&rel=0&autoplay=0&loop=0`;
}

type FetchLike = typeof fetch;

/**
 * Lien court → lien complet, en suivant au plus 3 redirections par leur seul en-tête Location (la page n'est pas lue).
 */
export async function resolveShortLink(input: string, fetchImpl: FetchLike = fetch): Promise<TikTokLink | null> {
  let current = toUrl(input)?.toString() ?? null;
  for (let hop = 0; current && hop < 3; hop++) {
    const direct = parseTikTokLink(current);
    if (direct) return direct;
    const res = await fetchImpl(current, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(6000) }).catch(() => null);
    const next = res?.headers.get('location');
    if (!next) return null;
    current = new URL(next, current).toString();
  }
  return current ? parseTikTokLink(current) : null;
}

export type OEmbedResult = { ok: true; id: string } | { ok: false; reason: 'introuvable' | 'indisponible' };

/**
 * oEmbed officiel : confirme que la vidéo est publique et donne son identifiant (`embed_product_id`). Réponse gardée
 * 12 h. « introuvable » = TikTok répond qu'il ne la connaît pas (privée, supprimée) ; « indisponible » = TikTok n'a
 * pas répondu (on continue sans).
 */
export async function fetchOEmbed(link: TikTokLink, fetchImpl: FetchLike = fetch): Promise<OEmbedResult> {
  try {
    const json = await cachedJson(`tiktok-oembed|${link.id}`, CACHE_TTL_HOURS.oembed, async () => {
      const res = await fetchImpl(`https://www.tiktok.com/oembed?url=${encodeURIComponent(link.url)}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (res.status === 400 || res.status === 404) return { missing: true };
      if (!res.ok) throw new Error(`oEmbed ${res.status}`);
      return (await res.json()) as Record<string, unknown>;
    });
    if (!json || (json as { missing?: boolean }).missing) return { ok: false, reason: 'introuvable' };
    const id = String((json as Record<string, unknown>).embed_product_id ?? '') || link.id;
    return { ok: true, id };
  } catch {
    return { ok: false, reason: 'indisponible' };
  }
}

export { repairAccents } from './text';
