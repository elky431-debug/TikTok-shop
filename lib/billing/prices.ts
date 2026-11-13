import { BRAND_SLUG } from '@/lib/brand';
import type { BillingInterval } from '@/lib/db/types';
import { isPaidPlan, type PaidPlanId } from '@/lib/plans';

/**
 * Prix Stripe retrouvés par leur `lookup_key` (`tracktout_<plan>_<month|year>`), posée par « npm run stripe:setup » :
 * aucune variable d'identifiant de prix à recopier. Quand un montant change, le script crée un nouveau prix et lui
 * transfère la clé ; les abonnés de l'ancien prix gardent le leur, reconnu par ses métadonnées.
 */
export function priceLookupKey(plan: PaidPlanId, interval: BillingInterval): string {
  return `${BRAND_SLUG}_${plan}_${interval}`;
}

/** Ancienne grille : `proplus` est devenu `elite`, `free` est devenu `aucun`. */
function normalizePlan(value: string | undefined | null): PaidPlanId | null {
  if (value === 'proplus') return 'elite';
  return value && isPaidPlan(value as PaidPlanId) ? (value as PaidPlanId) : null;
}

function normalizeInterval(value: unknown): BillingInterval | null {
  return value === 'month' || value === 'year' ? value : null;
}

export interface PriceLike {
  id?: string | null;
  lookup_key?: string | null;
  metadata?: Record<string, string> | null;
  recurring?: { interval?: string | null } | null;
}

/** Plan et période d'un prix : prix simulé, clé de recherche, sinon métadonnées posées par le script. */
export function planFromPrice(price: PriceLike | string | null | undefined): { plan: PaidPlanId; interval: BillingInterval } | null {
  if (!price) return null;
  const p: PriceLike = typeof price === 'string' ? { id: price } : price;
  const sim = /^sim_([a-z]+)_(month|year)$/.exec(p.id ?? '');
  if (sim) {
    const plan = normalizePlan(sim[1]);
    return plan ? { plan, interval: sim[2] as BillingInterval } : null;
  }
  const key = new RegExp(`^${BRAND_SLUG}_([a-z]+)_(month|year)$`).exec(p.lookup_key ?? '');
  if (key) {
    const plan = normalizePlan(key[1]);
    if (plan) return { plan, interval: key[2] as BillingInterval };
  }
  const plan = normalizePlan(p.metadata?.plan);
  const interval = normalizeInterval(p.recurring?.interval);
  return plan && interval ? { plan, interval } : null;
}

/** Ancien nom, gardé pour les appels qui n'ont que l'identifiant (prix simulés). */
export const planFromPriceId = (priceId: string | null | undefined) => planFromPrice(priceId);
