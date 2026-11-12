import { quickHook } from '@/lib/ai/mock-scripts';
import { MockProvider } from '@/lib/data/mock';
import { LocalRepo } from '@/lib/db/local';
import type { Product } from '@/lib/db/types';
import { getLiveCatalog } from '@/lib/catalog';
import { fallbackImageUrl } from '@/lib/product-image';
import { refreshCatalog } from '@/lib/jobs/refresh';
import type { ShowcaseProduct } from '@/components/public/radar-showcase';
import { nicheShort } from '@/lib/niches';
import { commissionPerSale, TREND_LABELS } from '@/lib/score';
import { formatCompact, formatEuros, formatGrowth, parisDate } from '@/lib/utils';

async function catalog(): Promise<{ products: Product[]; demo: boolean }> {
  try {
    const live = await getLiveCatalog();
    // Des données de plus de 36 heures ne sont pas montrées comme « ce matin » : aperçu fictif à la place.
    if (live.products.length && !live.stale) return { products: live.products, demo: live.demo };
  } catch {
    // Base indisponible au moment du rendu : on retombe sur les données fictives.
  }
  const memory = new LocalRepo(null);
  await refreshCatalog({ repo: memory, provider: new MockProvider(), date: parisDate() });
  return { products: await memory.listProducts(), demo: true };
}

/**
 * Produits défilant dans l'aperçu du radar de l'accueil : le meilleur produit qui monte dans
 * cinq niches différentes (beauté en premier, n°1 en France), avec une accroche chacun.
 */
export async function getShowcase(): Promise<{ products: ShowcaseProduct[]; demoData: boolean }> {
  const { products: all, demo } = await catalog();
  const products = [...all].sort((a, b) => b.latest_score - a.latest_score);
  const rising = (p: Product) => p.trend === 'explose' || p.trend === 'monte';
  const chosen: Product[] = [];
  for (const niche of NICHE_ORDER) {
    const best = products.find((p) => p.niche === niche && rising(p) && p.sales_30d.length >= 14);
    if (best) chosen.push(best);
    if (chosen.length === 5) break;
  }
  for (const p of products) {
    if (chosen.length >= 5) break;
    if (!chosen.includes(p)) chosen.push(p);
  }
  chosen.sort((a, b) => b.latest_score - a.latest_score);
  return {
    demoData: demo,
    products: chosen.map((p) => ({
      id: p.id,
      name: p.name,
      niche: nicheShort(p.niche),
      imageUrl: p.image_url,
      imageFallback: fallbackImageUrl(p.id, p.niche),
      price: formatEuros(p.price_cents),
      commission: formatEuros(commissionPerSale(p.price_cents, p.commission_rate)),
      trend: p.latest_breakdown?.growth_7d === null ? 'Tendance en mesure' : `${TREND_LABELS[p.trend]} ${formatGrowth(p.growth_7d)}`,
      rising: rising(p),
      affiliates: p.active_affiliates === null ? null : formatCompact(p.active_affiliates),
      score: p.latest_score,
      sales: p.sales_30d.slice(-14),
      hook: quickHook(p, p.snapshot_date ?? parisDate()),
    })),
  };
}

const NICHE_ORDER = ['beaute', 'maison', 'tech', 'mode', 'sport', 'animaux', 'bebe'] as const;
