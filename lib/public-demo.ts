import { quickHook } from '@/lib/ai/mock-scripts';
import { MockProvider } from '@/lib/data/mock';
import { getRepo } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { Product } from '@/lib/db/types';
import { env } from '@/lib/env';
import { refreshCatalog } from '@/lib/jobs/refresh';
import type { ShowcaseProduct } from '@/components/public/radar-showcase';
import { nicheShort } from '@/lib/niches';
import { commissionPerSale, TREND_LABELS } from '@/lib/score';
import { formatCompact, formatEuros, formatGrowth, parisDate } from '@/lib/utils';

async function catalog(): Promise<Product[]> {
  try {
    const products = await getRepo().listProducts();
    if (products.length) return products;
  } catch {
    // Base indisponible au moment du rendu : on retombe sur les données fictives.
  }
  const memory = new LocalRepo(null);
  await refreshCatalog({ repo: memory, provider: new MockProvider(), date: parisDate() });
  return memory.listProducts();
}

/**
 * Produits défilant dans l'aperçu du radar de l'accueil : le meilleur produit qui monte dans
 * cinq niches différentes (beauté en premier, n°1 en France), avec une accroche chacun.
 */
export async function getShowcase(): Promise<{ products: ShowcaseProduct[]; demoData: boolean }> {
  const products = await catalog();
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
    demoData: env.dataProvider === 'mock',
    products: chosen.map((p) => ({
      id: p.id,
      name: p.name,
      niche: nicheShort(p.niche),
      imageUrl: p.image_url,
      price: formatEuros(p.price_cents),
      commission: formatEuros(commissionPerSale(p.price_cents, p.commission_rate)),
      trend: `${TREND_LABELS[p.trend]} ${formatGrowth(p.growth_7d)}`,
      rising: rising(p),
      affiliates: formatCompact(p.active_affiliates),
      score: p.latest_score,
      sales: p.sales_30d.slice(-14),
      hook: quickHook(p, p.snapshot_date ?? parisDate()),
      freeSample: p.free_sample,
    })),
  };
}

const NICHE_ORDER = ['beaute', 'maison', 'tech', 'mode', 'sport', 'animaux', 'bebe'] as const;
