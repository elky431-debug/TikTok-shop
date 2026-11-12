import { getRepo } from '@/lib/db';
import { startCoachTrial } from '@/lib/billing/trial';

/** Fin d'onboarding : active l'essai de 3 mois si l'élève vient d'un formateur. */
export async function onOnboardingCompleted(userId: string): Promise<{ trialStarted: boolean }> {
  const profile = await getRepo().getProfile(userId);
  if (!profile?.coach_id || profile.trial_used) return { trialStarted: false };
  const started = await startCoachTrial(profile);
  return { trialStarted: started };
}
