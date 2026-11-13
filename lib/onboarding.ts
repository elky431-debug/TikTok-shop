import { getRepo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { sendLifecycleEmail } from '@/lib/lifecycle/send';
import { getRadar, parseFilters, type ProductView } from '@/lib/radar';

export * from './onboarding-steps';

/** Fin du profil : e-mail de bienvenue tout de suite (plus d'essai : l'abonnement se choisit juste après). */
export async function onOnboardingCompleted(userId: string): Promise<{ welcomeSent: boolean }> {
  const profile = await getRepo().getProfile(userId);
  if (!profile) return { welcomeSent: false };
  let welcomeSent = false;
  try {
    welcomeSent = await sendLifecycleEmail((await getRepo().getProfile(userId)) ?? profile, 'bienvenue', 'bienvenue');
  } catch (error) {
    // La tâche nocturne rattrape un e-mail de bienvenue qui n'a pas pu partir.
    console.warn('[bienvenue] e-mail', userId, error instanceof Error ? error.message : error);
  }
  return { welcomeSent };
}

/** Les 3 premiers produits du jour de ce compte, avec l'état du catalogue. */
export async function welcomeProducts(profile: Profile): Promise<{ products: ProductView[]; demo: boolean; stale: boolean }> {
  const radar = await getRadar(profile, parseFilters({}));
  const products = radar.items.flatMap((item) => (item.kind === 'visible' ? [item.product] : [])).slice(0, 3);
  return { products, demo: radar.demo, stale: radar.stale };
}
