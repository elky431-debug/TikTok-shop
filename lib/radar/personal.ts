import type { FollowerRange, Product, Profile, ScoreBreakdown, ScorePartKey } from '@/lib/db/types';
import { nicheShort, type NicheId } from '@/lib/niches';
import { followerRangeLabel, videoStyleLabel, type VideoStyleId } from '@/lib/profile-rules';
import { dailyScale, WEIGHTS } from '@/lib/score';
import { clamp } from '@/lib/utils';

/**
 * Score « pour toi » et poids réglables (bloc 2). Module pur.
 *
 * - Poids de base : ceux du score général (35 / 25 / 20 / 10), ou ceux que l'utilisateur Pro+ a réglés.
 * - Score général : le score du jour (poids par défaut) ; avec des poids réglés, les points de chaque critère sont
 *   recombinés avec ces poids puis replacés sur l'échelle du jour (15 à 90), comme le score enregistré.
 * - Score pour toi : mêmes points, poids ajustés selon la tranche d'abonnés, plus un petit bonus si le style vidéo
 *   colle à la niche, et un malus hors de ses niches. Replacé sur l'échelle du jour lui aussi.
 * Toujours expliqué en phrases (`personalReasons`). Règles chiffrées : docs/session5/blocs1-2-3.md (B8 à B10).
 */

export type Weights = Record<ScorePartKey, number>;

export const SCORE_KEYS: ScorePartKey[] = ['croissance', 'commission', 'saturation', 'prix'];
export const DEFAULT_WEIGHTS: Weights = { ...WEIGHTS };

export const WEIGHT_LABELS: Record<ScorePartKey, string> = {
  croissance: 'Croissance',
  commission: 'Commission',
  saturation: 'Concurrence',
  prix: 'Prix',
};

/** Réglages tout prêts proposés en Pro+. */
export const WEIGHT_PRESETS: Record<'commission' | 'croissance', { label: string; weights: Weights }> = {
  commission: { label: 'Plus de commission', weights: { croissance: 25, commission: 45, saturation: 20, prix: 10 } },
  croissance: { label: 'Plus de croissance', weights: { croissance: 55, commission: 15, saturation: 20, prix: 10 } },
};

/** Poids reçus d'un formulaire : entiers de 0 à 100, au moins un critère au-dessus de 0. */
export function sanitizeWeights(input: Partial<Record<string, unknown>>): Weights | null {
  const weights = {} as Weights;
  for (const key of SCORE_KEYS) {
    const n = Number(String(input[key] ?? '').replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    weights[key] = Math.round(clamp(n, 0, 100));
  }
  return SCORE_KEYS.some((k) => weights[k] > 0) ? weights : null;
}

export function isDefaultWeights(weights: Weights | null | undefined): boolean {
  if (!weights) return true;
  const total = SCORE_KEYS.reduce((s, k) => s + weights[k], 0);
  const base = SCORE_KEYS.reduce((s, k) => s + DEFAULT_WEIGHTS[k], 0);
  return SCORE_KEYS.every((k) => Math.abs(weights[k] / total - DEFAULT_WEIGHTS[k] / base) < 0.005);
}

/** Part de chaque critère sur 100, comme affichée (35/25/20/10 → 38,9/27,8/22,2/11,1). */
export function weightShares(weights: Weights): Weights {
  const total = SCORE_KEYS.reduce((s, k) => s + weights[k], 0) || 1;
  return Object.fromEntries(SCORE_KEYS.map((k) => [k, Math.round((weights[k] / total) * 1000) / 10])) as Weights;
}

/**
 * Points (0 à 100) d'un produit avec d'autres poids, à partir de la valeur de chaque critère déjà calculée (0 à 1).
 * Un critère non fourni par la source reste ignoré et son poids est réparti au prorata, comme dans le score.
 */
export function pointsWith(breakdown: Pick<ScoreBreakdown, 'parts'> | null, weights: Weights): number | null {
  if (!breakdown) return null;
  let weighted = 0;
  let total = 0;
  for (const part of breakdown.parts) {
    if (!SCORE_KEYS.includes(part.key) || part.available === false) continue;
    weighted += part.value * weights[part.key];
    total += weights[part.key];
  }
  return total > 0 ? clamp((weighted / total) * 100, 0, 100) : 0;
}

/**
 * Tranche d'abonnés → multiplicateur de chaque poids. Petit compte : la concurrence et le prix comptent plus (il faut
 * de la place et un achat facile) ; gros compte : la commission par vente compte plus (l'audience fait le volume).
 */
export const FOLLOWER_FACTORS: Record<FollowerRange, Partial<Weights>> = {
  '0-500': { saturation: 1.5, prix: 1.3, commission: 0.8 },
  '500-1500': { saturation: 1.4, prix: 1.2, commission: 0.9 },
  '1500-5000': {},
  '5000-20000': { commission: 1.25, saturation: 0.8 },
  '20000+': { commission: 1.4, saturation: 0.7 },
};

/** Niches où chaque style vidéo se montre le plus facilement (réglage de départ, voir B9). */
export const STYLE_NICHES: Record<VideoStyleId, NicheId[]> = {
  face_camera: ['beaute', 'mode', 'bebe'],
  voix_off: ['tech', 'maison', 'animaux'],
  mains: ['maison', 'tech', 'beaute'],
  avant_apres: ['beaute', 'maison', 'sport'],
};

/** Bonus de points quand le style colle à la niche, malus hors des niches choisies. */
export const STYLE_BONUS = 5;
export const OUTSIDE_NICHES_MALUS = 10;

export type PersonalProfile = Pick<Profile, 'follower_range' | 'video_style' | 'niches'>;

export function personalWeights(base: Weights, range: FollowerRange | null): Weights {
  const factors = (range && FOLLOWER_FACTORS[range]) || {};
  return Object.fromEntries(SCORE_KEYS.map((k) => [k, base[k] * (factors[k] ?? 1)])) as Weights;
}

function styleFits(profile: PersonalProfile, niche: NicheId): boolean {
  const niches = STYLE_NICHES[profile.video_style as VideoStyleId];
  return Boolean(niches?.includes(niche));
}

function outsideNiches(profile: PersonalProfile, niche: NicheId): boolean {
  return profile.niches.length > 0 && !profile.niches.includes(niche);
}

export function personalPoints(product: Pick<Product, 'niche' | 'latest_breakdown'>, profile: PersonalProfile, base: Weights): number | null {
  const points = pointsWith(product.latest_breakdown, personalWeights(base, profile.follower_range));
  if (points === null) return null;
  const bonus = (styleFits(profile, product.niche) ? STYLE_BONUS : 0) - (outsideNiches(profile, product.niche) ? OUTSIDE_NICHES_MALUS : 0);
  return clamp(points + bonus, 0, 100);
}

export interface ScoreSet {
  /** Score général affiché (poids par défaut, ou poids réglés en Pro+). */
  score: number;
  /** Score pour toi. */
  personal: number;
}

/**
 * Scores de tous les produits du catalogue du jour : l'échelle (15 à 90) est calculée sur l'ensemble, pour que les
 * scores restent comparables d'un produit à l'autre. Sans poids réglés, le score général est celui enregistré.
 */
export function computeScores(products: Product[], profile: PersonalProfile, custom: Weights | null): Map<string, ScoreSet> {
  const base = custom && !isDefaultWeights(custom) ? custom : DEFAULT_WEIGHTS;
  const generalPoints = products.map((p) => (base === DEFAULT_WEIGHTS ? null : pointsWith(p.latest_breakdown, base)));
  const personal = products.map((p) => personalPoints(p, profile, base));
  const known = (values: Array<number | null>) => values.filter((v): v is number => v !== null);
  const generalScale = dailyScale(known(generalPoints));
  const personalScale = dailyScale(known(personal));
  const result = new Map<string, ScoreSet>();
  products.forEach((p, i) => {
    const general = generalPoints[i] === null ? p.latest_score : generalScale(generalPoints[i]!);
    result.set(p.id, { score: general, personal: personal[i] === null ? general : personalScale(personal[i]!) });
  });
  return result;
}

const pct = (factor: number) => `${factor > 1 ? '+' : '−'}${Math.round(Math.abs(factor - 1) * 100)} %`;

/** Pourquoi le score pour toi diffère du score général, en phrases simples. */
export function personalReasons(product: Pick<Product, 'niche'>, profile: PersonalProfile, custom: Weights | null): string[] {
  const reasons: string[] = [];
  if (custom && !isDefaultWeights(custom)) {
    const shares = weightShares(custom);
    reasons.push(
      `Avec tes poids : ${SCORE_KEYS.map((k) => `${WEIGHT_LABELS[k].toLowerCase()} ${String(shares[k]).replace('.', ',')}`).join(', ')} sur 100.`,
    );
  }
  const range = profile.follower_range;
  const factors = range ? FOLLOWER_FACTORS[range] : null;
  if (range && factors && Object.keys(factors).length) {
    const parts = (Object.entries(factors) as Array<[ScorePartKey, number]>).map(([k, f]) => `${WEIGHT_LABELS[k].toLowerCase()} ${pct(f)}`);
    const small = range === '0-500' || range === '500-1500';
    reasons.push(
      `Ton compte (${followerRangeLabel(range).toLowerCase()} abonnés) : ${parts.join(', ')} sur le poids. ${
        small
          ? 'Avec une petite audience, il te faut un produit où il reste de la place et qui s’achète sans hésiter.'
          : 'Avec ton audience, la commission de chaque vente pèse plus lourd.'
      }`,
    );
  } else if (range) {
    reasons.push(`Ton compte (${followerRangeLabel(range).toLowerCase()} abonnés) : les poids du score général te conviennent.`);
  } else {
    reasons.push('Indique ta tranche d’abonnés dans ton compte pour un score encore plus juste.');
  }
  if (styleFits(profile, product.niche as NicheId)) {
    reasons.push(`Ton style « ${videoStyleLabel(profile.video_style)} » se prête bien aux produits ${nicheShort(product.niche).toLowerCase()} : +${STYLE_BONUS} points.`);
  }
  if (outsideNiches(profile, product.niche as NicheId)) {
    reasons.push(`Ce produit n’est pas dans tes niches : −${OUTSIDE_NICHES_MALUS} points.`);
  }
  return reasons;
}
