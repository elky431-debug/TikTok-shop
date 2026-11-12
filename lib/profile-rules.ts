import type { Eligibility, FollowerRange } from '@/lib/db/types';

export const AFFILIATE_THRESHOLD = 1500;

export const FOLLOWER_RANGES: Array<{ id: FollowerRange; label: string; eligible: boolean }> = [
  { id: '0-500', label: 'Moins de 500', eligible: false },
  { id: '500-1500', label: 'Entre 500 et 1 500', eligible: false },
  { id: '1500-5000', label: 'Entre 1 500 et 5 000', eligible: true },
  { id: '5000-20000', label: 'Entre 5 000 et 20 000', eligible: true },
  { id: '20000+', label: 'Plus de 20 000', eligible: true },
];

export function isFollowerRange(value: unknown): value is FollowerRange {
  return FOLLOWER_RANGES.some((r) => r.id === value);
}

/** Moins de 1 500 abonnés : mode préparation. Au-delà : affilié. */
export function eligibilityFor(range: FollowerRange | null | undefined): Eligibility {
  return FOLLOWER_RANGES.find((r) => r.id === range)?.eligible ? 'affilie' : 'preparation';
}

export function followerRangeLabel(range: FollowerRange | null | undefined): string {
  return FOLLOWER_RANGES.find((r) => r.id === range)?.label ?? 'Non renseigné';
}

export const VIDEO_STYLES = [
  { id: 'face_camera', label: 'Face caméra', hint: 'Tu parles directement à la caméra.' },
  { id: 'voix_off', label: 'Voix off', hint: 'On voit le produit, on entend ta voix.' },
  { id: 'mains', label: 'Mains seulement', hint: 'On ne voit que tes mains et le produit.' },
  { id: 'avant_apres', label: 'Avant-après', hint: 'Tu montres le résultat, en deux temps.' },
] as const;

export type VideoStyleId = (typeof VIDEO_STYLES)[number]['id'];

export function isVideoStyle(value: unknown): value is VideoStyleId {
  return VIDEO_STYLES.some((s) => s.id === value);
}

export function videoStyleLabel(id: string | null | undefined): string {
  return VIDEO_STYLES.find((s) => s.id === id)?.label ?? 'Non renseigné';
}

export const DIGEST_HOURS = [6, 7, 8, 9, 10, 11, 12] as const;
