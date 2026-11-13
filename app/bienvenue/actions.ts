'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { REFERRAL_COOKIE } from '@/lib/auth/constants';
import { requireViewer } from '@/lib/auth/session';
import { cleanHandle, refreshCreatorProfile } from '@/lib/creator-profile';
import { getRepo } from '@/lib/db';
import { env } from '@/lib/env';
import {
  ONBOARDING_STEPS,
  ONBOARDING_VERSION,
  onOnboardingCompleted,
  sanitizeAnswers,
  stepError,
  UPDATE_STEPS,
  type OnboardingAnswers,
  type OnboardingStep,
} from '@/lib/onboarding';
import { VIDEOS_PER_WEEK } from '@/lib/profile-rules';
import { applyReferralCode, normalizeCode } from '@/lib/referral';
import { setWeeklyGoal } from '@/lib/v2/board';
import { setEarningsGoal } from '@/lib/v2/earnings-store';

export type OnboardingResult = { ok: true; redirect: string } | { ok: false; step: OnboardingStep; message: string };

/**
 * Fin de l'onboarding : toutes les réponses sont revérifiées ici (le navigateur ne fait que guider). Premier passage :
 * profil complet, objectif de vidéos par semaine, objectif de gains, code formateur, essai et e-mail de bienvenue.
 * Compte existant (`maj`) : seulement les nouvelles questions.
 */
export async function completeOnboardingAction(raw: Partial<Record<keyof OnboardingAnswers, unknown>>, update: boolean): Promise<OnboardingResult> {
  const viewer = await requireViewer('/bienvenue');
  const repo = getRepo();
  const userId = viewer.user.id;
  const profile = viewer.profile;
  const firstTime = !profile.onboarded_at;
  const steps = firstTime || !update ? [...ONBOARDING_STEPS] : UPDATE_STEPS;
  const answers = sanitizeAnswers(raw);

  for (const step of steps) {
    const message = stepError(step, answers);
    if (message) return { ok: false, step, message };
  }

  let trial = false;
  if (steps.includes('code')) {
    const code = normalizeCode(answers.code);
    if (code && !profile.coach_id && !profile.referred_by) {
      const result = await applyReferralCode(profile, code);
      if (result.kind === 'none' && result.reason === 'inconnu') {
        return { ok: false, step: 'code', message: 'Ce code ne correspond à aucun formateur ni parrain. Vérifie-le ou passe cette question.' };
      }
    }
    cookies().delete(REFERRAL_COOKIE);
  }

  await repo.updateProfile(userId, {
    ...(steps.includes('prenom') ? { first_name: answers.first_name } : {}),
    ...(steps.includes('pseudo') ? { tiktok_handle: cleanHandle(answers.tiktok_handle) } : {}),
    ...(steps.includes('niches') ? { niches: answers.niches } : {}),
    follower_range: answers.follower_range,
    affiliate_status: answers.affiliate_status,
    experience_level: answers.experience_level,
    videos_per_week: answers.videos_per_week,
    video_styles: answers.video_styles,
    video_style: answers.video_styles[0] ?? null,
    onboarding_version: ONBOARDING_VERSION,
    ...(firstTime ? { onboarded_at: new Date().toISOString() } : {}),
  });
  const weekly = VIDEOS_PER_WEEK.find((v) => v.id === answers.videos_per_week)?.weekly;
  if (weekly) await setWeeklyGoal(repo, userId, weekly);
  if (answers.monthly_goal_euros) await setEarningsGoal(repo, userId, answers.monthly_goal_euros * 100);

  if (firstTime) trial = (await onOnboardingCompleted(userId)).trialStarted;
  revalidatePath('/app', 'layout');
  return { ok: true, redirect: firstTime ? `/app?bienvenue=${trial ? 'essai' : '1'}` : '/app' };
}

export type CreatorPreview =
  | { ok: true; handle: string; nickname: string | null; followers: number | null; likes: number | null; videos: number | null }
  | { ok: false; message: string };

/**
 * Aperçu du compte TikTok à partir du pseudo (Nexscope, route documentée). Même règle qu'au dashboard : un relevé par
 * personne et par jour au plus ; le pseudo est enregistré pour que le relevé lui corresponde.
 */
export async function previewCreatorAction(rawHandle: string): Promise<CreatorPreview> {
  const viewer = await requireViewer('/bienvenue');
  const handle = cleanHandle(rawHandle);
  if (!handle) return { ok: false, message: 'Ce pseudo ne ressemble pas à un pseudo TikTok.' };
  if (!env.nexscopeApiKey) return { ok: false, message: 'Aperçu indisponible pour l’instant : continue, tu choisiras la taille de ton compte juste après.' };
  const repo = getRepo();
  await repo.updateProfile(viewer.user.id, { tiktok_handle: handle });
  const result = await refreshCreatorProfile(repo, viewer.user.id, handle);
  if (!result || result.handle.toLowerCase() !== handle.toLowerCase() || !result.fetched_at) {
    return { ok: false, message: result?.error ?? 'Aperçu déjà demandé aujourd’hui : continue, tu choisiras la taille de ton compte juste après.' };
  }
  return { ok: true, handle: result.handle, nickname: result.nickname, followers: result.followers, likes: result.likes, videos: result.videos };
}
