import { describe, expect, it } from 'vitest';
import { isShortTikTokLink, parseTikTokLink, playerUrl, resolveShortLink } from '@/lib/tiktok/video';
import { repairAccents } from '@/lib/tiktok/text';

describe('liens TikTok', () => {
  it('lit l’identifiant d’un lien complet, avec ou sans texte autour', () => {
    expect(parseTikTokLink('https://www.tiktok.com/@fediukstore/video/7703532774304582934?is_from_webapp=1')).toEqual({
      id: '7703532774304582934',
      url: 'https://www.tiktok.com/@fediukstore/video/7703532774304582934',
    });
    expect(parseTikTokLink('Regarde ça https://www.tiktok.com/@a.b_c/video/7703532774304582934.')?.id).toBe('7703532774304582934');
    expect(parseTikTokLink('www.tiktok.com/@marque/video/7704466674832952609')?.id).toBe('7704466674832952609');
    expect(parseTikTokLink('https://www.tiktok.com/player/v1/6718335390845095173')).toEqual({
      id: '6718335390845095173',
      url: 'https://www.tiktok.com/@_/video/6718335390845095173',
    });
    expect(parseTikTokLink('https://m.tiktok.com/v/6718335390845095173.html')?.id).toBe('6718335390845095173');
  });

  it('refuse ce qui n’est pas une vidéo TikTok', () => {
    expect(parseTikTokLink('https://www.tiktok.com/@marque')).toBeNull();
    expect(parseTikTokLink('https://www.youtube.com/watch?v=123456789')).toBeNull();
    expect(parseTikTokLink('https://faux-tiktok.com/@a/video/7703532774304582934')).toBeNull();
    expect(parseTikTokLink('pas un lien')).toBeNull();
  });

  it('reconnaît les liens courts de partage', () => {
    expect(isShortTikTokLink('https://vm.tiktok.com/ZNdAbC123/')).toBe(true);
    expect(isShortTikTokLink('https://www.tiktok.com/t/ZTabc123/')).toBe(true);
    expect(isShortTikTokLink('https://www.tiktok.com/@a/video/7703532774304582934')).toBe(false);
  });

  it('résout un lien court par l’en-tête de redirection, sans lire la page', async () => {
    const calls: Array<{ url: string; method?: string; redirect?: string }> = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, redirect: init?.redirect });
      return new Response(null, { status: 301, headers: { location: 'https://www.tiktok.com/@compte/video/7704466674832952609?_r=1' } });
    }) as unknown as typeof fetch;
    expect(await resolveShortLink('https://vm.tiktok.com/ZNdAbC123/', fake)).toEqual({
      id: '7704466674832952609',
      url: 'https://www.tiktok.com/@compte/video/7704466674832952609',
    });
    expect(calls).toEqual([{ url: 'https://vm.tiktok.com/ZNdAbC123/', method: 'HEAD', redirect: 'manual' }]);
  });

  it('donne l’adresse du lecteur officiel', () => {
    expect(playerUrl('1')).toMatch(/^https:\/\/www\.tiktok\.com\/player\/v1\/1\?description=1/);
  });

  it('répare les accents abîmés sans toucher au reste', () => {
    expect(repairAccents('D￩j￠ l￠, tr￨s ﾫbienﾻ')).toBe('Déjà là, très «bien»');
    expect(repairAccents('Déjà parfait ! 😀')).toBe('Déjà parfait ! 😀');
  });
});
