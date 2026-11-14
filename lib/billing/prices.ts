import { BRAND_SLUG } from '@/lib/brand';
import type { BillingInterval } from '@/lib/db/types';
import { isPaidPlan, type PaidPlanId } from '@/lib/plans';

/**
 * Prix Stripe retrouvés par leur `lookup_key`, créés dans le tableau de bord Stripe : `starter_mensuel`,
 * `starter_annuel`, `pro_mensuel`, `pro_annuel`, `elite_mensuel`, `elite_annuel`. Aucune variable d'identifiant de prix à
 * recopier ; « npm run stripe:setup » vérifie qu'ils existent et que leurs montants suivent lib/plans.ts.
 */
export const INTERVAL_SUFFIX: Record<BillingInterval, string> = { month: 'mensuel', year: 'annuel' };

export function priceLookupKey(plan: PaidPlanId, interval: BillingInterval): string {
  return `${plan}_${INTERVAL_SUFFIX[interval]}`;
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
  const key = /^([a-z]+)_(mensuel|annuel)$/.exec(p.lookup_key ?? '');
  if (key) {
    const plan = normalizePlan(key[1]);
    if (plan) return { plan, interval: key[2] === 'annuel' ? 'year' : 'month' };
  }
  // Anciennes clés (`tracktout_<plan>_<month|year>`), pour les abonnements créés avec elles.
  const legacy = new RegExp(`^${BRAND_SLUG}_([a-z]+)_(month|year)$`).exec(p.lookup_key ?? '');
  if (legacy) {
    const plan = normalizePlan(legacy[1]);
    if (plan) return { plan, interval: legacy[2] as BillingInterval };
  }
  const plan = normalizePlan(p.metadata?.plan);
  const interval = normalizeInterval(p.recurring?.interval);
  return plan && interval ? { plan, interval } : null;
}

/** Ancien nom, gardé pour les appels qui n'ont que l'identifiant (prix simulés). */
export const planFromPriceId = (priceId: string | null | undefined) => planFromPrice(priceId);
