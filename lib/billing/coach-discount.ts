import { BRAND_SLUG } from '@/lib/brand';
import type { Repo } from '@/lib/db';
import type { BillingInterval, Profile } from '@/lib/db/types';
import { COACH_FIRST_MONTH_DISCOUNT, getPlan, type PaidPlanId } from '@/lib/plans';

/**
 * Code formateur : −20 % sur le premier mois (plus de mois offerts). Un premier mois n'existe que dans l'abonnement
 * mensuel : la remise s'applique au premier paiement mensuel, une seule fois par compte (aucun abonnement avant). Le
 * formateur garde ses 30 % de commission récurrente, calculés sur ce qui est vraiment payé.
 */
export const COACH_COUPON_ID = `${BRAND_SLUG}_formateur_20`;

/** Le code formateur réduit-il ce paiement ? */
export async function coachDiscountApplies(repo: Repo, profile: Profile, interval: BillingInterval): Promise<boolean> {
  if (!profile.coach_id || interval !== 'month') return false;
  const subscriptions = (await repo.listSubscriptions()).filter((s) => s.user_id === profile.id);
  return subscriptions.length === 0;
}

/** Prix du premier mois avec la remise, en centimes. */
export function discountedFirstMonth(plan: PaidPlanId): number {
  return Math.round(getPlan(plan).prices.month * (1 - COACH_FIRST_MONTH_DISCOUNT));
}
