import { getRepo } from '@/lib/db';
import { startCoachTrial } from '@/lib/billing/trial';
import type { Profile } from '@/lib/db/types';
import { sendLifecycleEmail } from '@/lib/lifecycle/send';
import { getRadar, parseFilters, type ProductView } from '@/lib/radar';

export * from './onboarding-steps';

/** Fin du profil : essai de 3 mois si l'élève vient d'un formateur, e-mail de bienvenue tout de suite. */
export async function onOnboardingCompleted(userId: string): Promise<{ trialStarted: boolean; welcomeSent: boolean }> {
  const profile = await getRepo().getProfile(userId);
  if (!profile) return { trialStarted: false, welcomeSent: false };
  const trialStarted = profile.coach_id && !profile.trial_used ? await startCoachTrial(profile) : false;
  let welcomeSent = false;
  try {
    welcomeSent = await sendLifecycleEmail((await getRepo().getProfile(userId)) ?? profile, 'bienvenue', 'bienvenue');
  } catch (error) {
    // La tâche nocturne rattrape un e-mail de bienvenue qui n'a pas pu partir.
    console.warn('[bienvenue] e-mail', userId, error instanceof Error ? error.message : error);
  }
  return { trialStarted, welcomeSent };
}

/** Les 3 premiers produits du jour visibles pour ce compte (ceux du plan Gratuit), avec l'état du catalogue. */
export async function welcomeProducts(profile: Profile): Promise<{ products: ProductView[]; demo: boolean; stale: boolean }> {
  const radar = await getRadar(profile, parseFilters({}));
  const products = radar.items.flatMap((item) => (item.kind === 'visible' ? [item.product] : [])).slice(0, 3);
  return { products, demo: radar.demo, stale: radar.stale };
}
