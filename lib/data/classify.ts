import { isAllowedImageHost } from '@/config/image-hosts.mjs';
import type { NicheId } from '@/lib/niches';
import type { ProviderProduct } from './provider';

/** Résultat de la correspondance d'un produit reçu : retenu, ou écarté avec la raison. */
export type MapResult = { ok: true; product: ProviderProduct; rejectedImageHost?: string } | { ok: false; reason: string };

/**
 * Range un produit dans une niche Tracktout à partir du nom de sa catégorie chez le fournisseur
 * (anglais ou français, accents ignorés). Sans correspondance : null, et le produit est écarté plutôt
 * que rangé au hasard. L'ordre compte : les niches les plus précises d'abord.
 */
const words = (list: string[]) => new RegExp(`\\b(${list.join('|')})s?\\b`);

const RULES: Array<[NicheId, RegExp]> = [
  ['animaux', words(['pet', 'animal', 'animaux', 'chien', 'chat', 'dog', 'cat'])],
  ['bebe', words(['baby', 'babie', 'bebe', 'maternity', 'maternite', 'puericulture', 'nursery'])],
  ['beaute', words(['beauty', 'beaute', 'personal care', 'soin', 'cosmetic', 'cosmetique', 'makeup', 'maquillage', 'skincare', 'parfum', 'fragrance', 'hair', 'cheveux'])],
  ['tech', words(['phone', 'telephone', 'electronic', 'electronique', 'computer', 'ordinateur', 'informatique', 'gadget', 'audio'])],
  ['sport', words(['sport', 'outdoor', 'plein air', 'fitness', 'health', 'sante', 'bien-etre', 'wellness'])],
  ['mode', words(['womenswear', 'menswear', 'fashion', 'mode', 'vetement', 'clothing', 'apparel', 'shoe', 'chaussure', 'bag', 'sac', 'luggage', 'bagagerie', 'jewelry', 'jewellery', 'bijou', 'bijoux'])],
  ['maison', words(['home', 'maison', 'kitchen', 'kitchenware', 'cuisine', 'household', 'menager', 'textile', 'furniture', 'meuble', 'decor', 'deco', 'appliance', 'electromenager', 'rangement'])],
];

export function normalizeCategory(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' ');
}

export function nicheFromCategories(names: Array<string | null | undefined>): NicheId | null {
  for (const raw of names) {
    if (!raw) continue;
    const name = normalizeCategory(raw);
    for (const [niche, pattern] of RULES) if (pattern.test(name)) return niche;
  }
  return null;
}

/** Montant décimal (« 34.3 », 34.3) en centimes ; null si absent ou invalide. */
export function toCents(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function toCount(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.hostname : null;
  } catch {
    return null;
  }
}

/** Garde l'image seulement si elle est en https sur un domaine autorisé ; sinon '' (visuel générique). */
export function checkImage(url: unknown): { image: string; rejectedHost?: string } {
  if (typeof url !== 'string' || !url) return { image: '' };
  const host = hostOf(url);
  if (host && isAllowedImageHost(host)) return { image: url };
  return { image: '', rejectedHost: host ?? undefined };
}
