import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { REFERRAL_COOKIE } from '@/lib/auth/constants';
import { requireViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { env } from '@/lib/env';
import { initialAnswers, ONBOARDING_STEPS, ONBOARDING_VERSION, UPDATE_STEPS } from '@/lib/onboarding';
import { getEarningsGoal } from '@/lib/v2/earnings-store';
import { OnboardingFlow } from './onboarding-flow';

export const metadata: Metadata = { title: 'Bienvenue' };
export const dynamic = 'force-dynamic';

/**
 * Onboarding : une question par écran (10 au premier passage), puis « On prépare ton radar » et le dashboard. Un compte
 * de l'ancien onboarding ne voit que les nouvelles questions, une fois, avec ses réponses déjà connues cochées.
 */
export default async function BienvenuePage() {
  const { profile } = await requireViewer('/bienvenue');
  const update = Boolean(profile.onboarded_at);
  if (update && profile.onboarding_version >= ONBOARDING_VERSION) redirect('/app');

  const repo = getRepo();
  const [goal, coach] = await Promise.all([
    getEarningsGoal(repo, profile.id),
    profile.coach_id ? repo.getCoachById(profile.coach_id) : Promise.resolve(null),
  ]);
  const pendingCode = cookies().get(REFERRAL_COOKIE)?.value ?? '';
  // Déjà rattaché à un formateur (lien d'invitation) : la question du code ne sert plus.
  const steps = update ? UPDATE_STEPS : ONBOARDING_STEPS.filter((s) => s !== 'code' || !profile.referred_by || Boolean(coach));

  return (
    <OnboardingFlow
      steps={[...steps]}
      initial={initialAnswers(profile, goal.cents, pendingCode)}
      update={update}
      previewAvailable={Boolean(env.nexscopeApiKey)}
      coachCode={coach?.promo_code ?? null}
    />
  );
}
