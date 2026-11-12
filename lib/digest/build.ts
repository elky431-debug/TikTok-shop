import type { DigestContent, DigestProduct, Product, Profile } from '@/lib/db/types';
import { isDemoProduct } from '@/lib/catalog';
import { getPlan } from '@/lib/plans';
import { rankForUser } from '@/lib/radar-rules';
import { commissionPerSale, TREND_LABELS } from '@/lib/score';
import { formatGrowth } from '@/lib/utils';

export interface DigestExtras {
  hookFor: (product: Product) => Promise<string>;
  scriptFor: (product: Product, profile: Profile) => Promise<{ title: string; lines: string[] } | null>;
}

function reason(product: Product): string {
  const measured = product.latest_breakdown ? product.latest_breakdown.growth_7d !== null : true;
  const bits = [measured ? `${TREND_LABELS[product.trend]} · ${formatGrowth(product.growth_7d)} en 7 jours` : 'Nouveau dans le radar, tendance en mesure'];
  return bits.join(' · ');
}

/** Contenu du récap du matin pour un utilisateur : 5 produits (3 en gratuit), une accroche, un script. */
export async function buildDigestContent(
  profile: Profile,
  products: Product[],
  day: string,
  extras: DigestExtras,
): Promise<DigestContent> {
  const plan = getPlan(profile.plan);
  const ranked = rankForUser(products, profile.niches);
  const count = Math.min(5, Number.isFinite(plan.visibleProducts) ? plan.visibleProducts : 5);
  const chosen = ranked.slice(0, count);
  const items: DigestProduct[] = chosen.map((p) => ({
    id: p.id,
    name: p.name,
    niche: p.niche,
    price_cents: p.price_cents,
    commission_cents: commissionPerSale(p.price_cents, p.commission_rate),
    score: plan.showScore ? p.latest_score : null,
    trend: p.trend,
    growth_7d: p.growth_7d,
    reason: reason(p),
  }));
  const top = chosen[0];
  return {
    date: day,
    first_name: profile.first_name,
    plan: profile.plan,
    products: items,
    hook: top ? { product_id: top.id, product_name: top.name, text: await extras.hookFor(top) } : null,
    script: top ? await extras.scriptFor(top, profile).then((s) => (s ? { product_id: top.id, product_name: top.name, ...s } : null)) : null,
    locked_count: Number.isFinite(plan.visibleProducts) ? Math.max(0, ranked.length - count) : 0,
    ...(chosen.length && chosen.every(isDemoProduct) ? { demo: true } : {}),
  };
}
