import type { PlanId } from '@/lib/db/types';
import { getPlan, yearlySavings } from '@/lib/plans';
import { formatEuros } from '@/lib/utils';

/**
 * Offre annuelle mise en avant au moment de payer : économie réelle calculée depuis les prix de lib/plans.ts (jamais un
 * chiffre écrit à la main), exprimée en euros, en pourcentage et en mois offerts.
 */
export function annualOffer(plan: Exclude<PlanId, 'free'>) {
  const p = getPlan(plan);
  const savingsCents = yearlySavings(plan);
  const months = savingsCents / p.prices.month;
  const whole = Math.floor(months + 1e-9);
  const percent = Math.round((savingsCents / (p.prices.month * 12)) * 100);
  return {
    savingsCents,
    savings: formatEuros(savingsCents, { round: true }),
    percent,
    monthsFree: whole,
    badge: whole >= 1 ? `${months - whole > 0.05 ? 'Plus de ' : ''}${whole} mois offert${whole > 1 ? 's' : ''}` : `−${percent} %`,
  };
}
