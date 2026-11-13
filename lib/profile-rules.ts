import type { AffiliateStatus, Eligibility, ExperienceLevel, FollowerRange, VideosPerWeek } from '@/lib/db/types';

export const AFFILIATE_THRESHOLD = 1500;

/** Tranches proposées (onboarding 2 et compte). « eligible » : toujours au-dessus du seuil de 1 500 abonnés. */
export const FOLLOWER_RANGES: Array<{ id: FollowerRange; label: string; eligible: boolean }> = [
  { id: '0-1000', label: 'Moins de 1 000', eligible: false },
  { id: '1000-5000', label: 'Entre 1 000 et 5 000', eligible: false },
  { id: '5000-20000', label: 'Entre 5 000 et 20 000', eligible: true },
  { id: '20000-100000', label: 'Entre 20 000 et 100 000', eligible: true },
  { id: '100000+', label: 'Plus de 100 000', eligible: true },
];

/** Anciennes tranches, encore lisibles pour les comptes qui n'ont pas répondu au nouvel onboarding. */
export const LEGACY_FOLLOWER_RANGES: Array<{ id: FollowerRange; label: string; eligible: boolean }> = [
  { id: '0-500', label: 'Moins de 500', eligible: false },
  { id: '500-1500', label: 'Entre 500 et 1 500', eligible: false },
  { id: '1500-5000', label: 'Entre 1 500 et 5 000', eligible: true },
  { id: '20000+', label: 'Plus de 20 000', eligible: true },
];

const ALL_RANGES = [...FOLLOWER_RANGES, ...LEGACY_FOLLOWER_RANGES];

export function isFollowerRange(value: unknown): value is FollowerRange {
  return FOLLOWER_RANGES.some((r) => r.id === value);
}

export const AFFILIATE_STATUSES: Array<{ id: AffiliateStatus; label: string }> = [
  { id: 'oui', label: 'Oui' },
  { id: 'pas_encore', label: 'Pas encore' },
  { id: 'ne_sait_pas', label: 'Je ne sais pas' },
];
export const isAffiliateStatus = (v: unknown): v is AffiliateStatus => AFFILIATE_STATUSES.some((s) => s.id === v);

export const EXPERIENCE_LEVELS: Array<{ id: ExperienceLevel; label: string; hint: string }> = [
  { id: 'debute', label: 'Je débute', hint: 'Pas encore de vente en affiliation.' },
  { id: 'quelques_ventes', label: 'J’ai fait quelques ventes', hint: 'Ça a commencé, il faut que ça devienne régulier.' },
  { id: 'regulier', label: 'Je vends régulièrement', hint: 'Tu cherches les prochains produits qui marchent.' },
];
export const isExperienceLevel = (v: unknown): v is ExperienceLevel => EXPERIENCE_LEVELS.some((s) => s.id === v);

export const VIDEOS_PER_WEEK: Array<{ id: VideosPerWeek; label: string; weekly: number; rhythm: 3 | 5 | 7 }> = [
  { id: '1-3', label: '1 à 3 vidéos', weekly: 3, rhythm: 3 },
  { id: '4-7', label: '4 à 7 vidéos', weekly: 5, rhythm: 5 },
  { id: '7+', label: 'Plus de 7 vidéos', weekly: 7, rhythm: 7 },
];
export const isVideosPerWeek = (v: unknown): v is VideosPerWeek => VIDEOS_PER_WEEK.some((s) => s.id === v);

/** Rythme du plan de publication proposé par défaut selon le nombre de vidéos par semaine visé. */
export function rhythmFor(value: VideosPerWeek | null | undefined): 3 | 5 | 7 {
  return VIDEOS_PER_WEEK.find((v) => v.id === value)?.rhythm ?? 5;
}

/**
 * Mode préparation ou affilié. « Pas encore » affilié ⇒ préparation ; sous 1 500 abonnés ⇒ préparation ; entre 1 000
 * et 5 000 (la tranche chevauche le seuil) ⇒ affilié seulement si la personne dit l'être déjà. Même règle que le
 * déclencheur `sync_eligibility` de Supabase.
 */
export function eligibilityFor(range: FollowerRange | null | undefined, affiliate: AffiliateStatus | null = null): Eligibility {
  if (affiliate === 'pas_encore') return 'preparation';
  if (ALL_RANGES.find((r) => r.id === range)?.eligible) return 'affilie';
  if (range === '1000-5000' && affiliate === 'oui') return 'affilie';
  return 'preparation';
}

export function followerRangeLabel(range: FollowerRange | null | undefined): string {
  return ALL_RANGES.find((r) => r.id === range)?.label ?? 'Non renseigné';
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
