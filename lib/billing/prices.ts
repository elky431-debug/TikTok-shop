import type { BillingInterval, PlanId } from '@/lib/db/types';
import { env } from '@/lib/env';

type PaidPlan = Exclude<PlanId, 'free'>;

/** Identifiant de prix chez le prestataire pour un plan et une période. */
export function priceIdFor(plan: PaidPlan, interval: BillingInterval): string {
  const prices = env.stripePrices;
  const key = `${plan}_${interval}` as keyof typeof prices;
  return prices[key];
}

/** Retrouve le plan et la période depuis un identifiant de prix (Stripe ou simulation). */
export function planFromPriceId(priceId: string | null | undefined): { plan: PaidPlan; interval: BillingInterval } | null {
  if (!priceId) return null;
  const sim = /^sim_(pro|proplus)_(month|year)$/.exec(priceId);
  if (sim) return { plan: sim[1] as PaidPlan, interval: sim[2] as BillingInterval };
  const prices = env.stripePrices;
  for (const [key, value] of Object.entries(prices)) {
    if (value && value === priceId) {
      const [plan, interval] = key.split('_') as [PaidPlan, BillingInterval];
      return { plan, interval };
    }
  }
  return null;
}

export function missingPriceIds(): string[] {
  const prices = env.stripePrices;
  const names: Record<keyof typeof prices, string> = {
    pro_month: 'STRIPE_PRICE_PRO_MONTHLY',
    pro_year: 'STRIPE_PRICE_PRO_YEARLY',
    proplus_month: 'STRIPE_PRICE_PROPLUS_MONTHLY',
    proplus_year: 'STRIPE_PRICE_PROPLUS_YEARLY',
  };
  return (Object.keys(prices) as Array<keyof typeof prices>).filter((k) => !prices[k]).map((k) => names[k]);
}
