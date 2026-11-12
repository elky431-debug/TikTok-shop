import { getRepo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { COACH_TRIAL_DAYS } from '@/lib/plans';
import { getBilling } from './index';

/**
 * Essai Pro de 3 mois pour les élèves arrivés avec un code formateur.
 * Géré comme un essai Stripe (sans carte, annulé automatiquement à la fin si aucun moyen de paiement).
 */
export async function startCoachTrial(profile: Profile): Promise<boolean> {
  if (!profile.coach_id || profile.trial_used) return false;
  const active = await getRepo().getActiveSubscription(profile.id);
  if (active) return false;
  try {
    await getBilling().startTrial({ profile, days: COACH_TRIAL_DAYS });
    return true;
  } catch (error) {
    console.error('[essai formateur] échec', error);
    return false;
  }
}
