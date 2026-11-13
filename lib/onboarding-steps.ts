import type { AffiliateStatus, ExperienceLevel, FollowerRange, Profile, VideosPerWeek } from '@/lib/db/types';
import { isNicheId, type NicheId } from '@/lib/niches';
import {
  isAffiliateStatus,
  isExperienceLevel,
  isFollowerRange,
  isVideosPerWeek,
  isVideoStyle,
  type VideoStyleId,
} from '@/lib/profile-rules';

/**
 * Onboarding 2 : une question par écran (10 écrans, environ 1 minute), puis « On prépare ton radar » et le dashboard,
 * produit du jour en avant. Les comptes de l'ancien onboarding ne voient que les nouvelles questions, une fois.
 */
export const ONBOARDING_STEPS = ['prenom', 'pseudo', 'abonnes', 'affilie', 'niveau', 'niches', 'rythme', 'styles', 'objectif', 'code'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
/** Questions ajoutées par l'onboarding 2, posées une fois aux comptes existants (réponses actuelles déjà cochées). */
export const UPDATE_STEPS: OnboardingStep[] = ['abonnes', 'affilie', 'niveau', 'rythme', 'styles', 'objectif'];
export const OPTIONAL_STEPS: ReadonlySet<OnboardingStep> = new Set(['pseudo', 'objectif', 'code']);
export const ONBOARDING_VERSION = 2;
export const MAX_NICHES = 3;
/** Objectif mensuel : 1 € à 100 000 €. */
export const MAX_MONTHLY_GOAL_EUROS = 100_000;

export interface OnboardingAnswers {
  first_name: string;
  tiktok_handle: string;
  follower_range: FollowerRange | null;
  affiliate_status: AffiliateStatus | null;
  experience_level: ExperienceLevel | null;
  niches: NicheId[];
  videos_per_week: VideosPerWeek | null;
  video_styles: VideoStyleId[];
  /** Objectif personnel de gains par mois, en euros ; null = passé. */
  monthly_goal_euros: number | null;
  code: string;
}

const HANDLE = /^[A-Za-z0-9._]{2,24}$/;

/** Message d'erreur de l'écran (null = on peut continuer). Mêmes règles côté navigateur et côté serveur. */
export function stepError(step: OnboardingStep, a: OnboardingAnswers): string | null {
  switch (step) {
    case 'prenom':
      return a.first_name.trim() ? null : 'Indique ton prénom : on l’utilise dans ton récap du matin.';
    case 'pseudo': {
      const handle = a.tiktok_handle.trim().replace(/^@+/, '');
      return !handle || HANDLE.test(handle) ? null : 'Ton pseudo ne peut contenir que des lettres, des chiffres, des points et des tirets bas.';
    }
    case 'abonnes':
      return isFollowerRange(a.follower_range) ? null : 'Choisis la taille de ton compte aujourd’hui.';
    case 'affilie':
      return isAffiliateStatus(a.affiliate_status) ? null : 'Choisis une réponse.';
    case 'niveau':
      return isExperienceLevel(a.experience_level) ? null : 'Choisis ton niveau.';
    case 'niches':
      if (a.niches.length === 0) return 'Choisis au moins une niche.';
      return a.niches.length > MAX_NICHES ? 'Trois niches maximum.' : null;
    case 'rythme':
      return isVideosPerWeek(a.videos_per_week) ? null : 'Choisis ton rythme.';
    case 'styles':
      return a.video_styles.length ? null : 'Choisis au moins un style.';
    case 'objectif':
      return a.monthly_goal_euros === null || (Number.isInteger(a.monthly_goal_euros) && a.monthly_goal_euros > 0 && a.monthly_goal_euros <= MAX_MONTHLY_GOAL_EUROS)
        ? null
        : 'Indique un montant entier entre 1 € et 100 000 €, ou passe cette question.';
    case 'code':
      return !a.code.trim() || /^[A-Z0-9-]{3,24}$/i.test(a.code.trim()) ? null : 'Ce code ne ressemble pas à un code formateur.';
  }
}

/** Nettoie des réponses venues du navigateur (rien n'est cru tel quel). */
export function sanitizeAnswers(raw: Partial<Record<keyof OnboardingAnswers, unknown>>): OnboardingAnswers {
  const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const list = <T,>(v: unknown, ok: (x: unknown) => x is T) => [...new Set(Array.isArray(v) ? v.filter(ok) : [])];
  const goal = raw.monthly_goal_euros === null || raw.monthly_goal_euros === undefined || raw.monthly_goal_euros === '' ? null : Number(raw.monthly_goal_euros);
  return {
    first_name: text(raw.first_name, 60),
    tiktok_handle: text(raw.tiktok_handle, 40).replace(/^@+/, ''),
    follower_range: isFollowerRange(raw.follower_range) ? raw.follower_range : null,
    affiliate_status: isAffiliateStatus(raw.affiliate_status) ? raw.affiliate_status : null,
    experience_level: isExperienceLevel(raw.experience_level) ? raw.experience_level : null,
    niches: list(raw.niches, isNicheId) as NicheId[],
    videos_per_week: isVideosPerWeek(raw.videos_per_week) ? raw.videos_per_week : null,
    video_styles: list(raw.video_styles, isVideoStyle) as VideoStyleId[],
    monthly_goal_euros: goal === null ? null : Number.isFinite(goal) ? Math.round(goal) : NaN,
    code: text(raw.code, 24).toUpperCase(),
  };
}

/** Réponses de départ : celles déjà connues (comptes existants, retour en arrière), rien d'inventé. */
export function initialAnswers(profile: Profile, goalCents: number | null, pendingCode = ''): OnboardingAnswers {
  return {
    first_name: profile.first_name ?? '',
    tiktok_handle: profile.tiktok_handle ?? '',
    follower_range: isFollowerRange(profile.follower_range) ? profile.follower_range : null,
    affiliate_status: profile.affiliate_status,
    experience_level: profile.experience_level,
    niches: profile.niches.slice(0, MAX_NICHES),
    videos_per_week: profile.videos_per_week,
    video_styles: (profile.video_styles?.length ? profile.video_styles : profile.video_style ? [profile.video_style] : []).filter(isVideoStyle),
    monthly_goal_euros: goalCents ? Math.round(goalCents / 100) : null,
    code: pendingCode,
  };
}

