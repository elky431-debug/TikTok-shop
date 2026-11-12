import { generateMockScripts, quickHook } from '@/lib/ai/mock-scripts';
import type { ScriptOutput } from '@/lib/ai/types';
import { MockProvider } from '@/lib/data/mock';
import { getRepo } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { Product } from '@/lib/db/types';
import { env } from '@/lib/env';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { parisDate } from '@/lib/utils';

export interface HeroDemo {
  product: Product;
  hook: string;
  scripts: ScriptOutput;
  demoData: boolean;
}

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

/** Produit du jour montré sur l'accueil : le meilleur produit beauté qui monte (beauté = n°1 en France). */
export async function getHeroDemo(): Promise<HeroDemo> {
  const products = await catalog();
  const rising = (p: Product) => p.trend === 'explose' || p.trend === 'monte';
  const product =
    products.find((p) => p.niche === 'beaute' && rising(p) && p.sales_30d.length >= 14) ??
    products.find(rising) ??
    products[0];
  const day = product.snapshot_date ?? parisDate();
  return {
    product,
    hook: quickHook(product, day),
    scripts: generateMockScripts({
      product,
      format: 'demo',
      style: 'face_camera',
      examplePhrase: null,
      firstName: null,
      topVideos: product.top_videos,
    }),
    demoData: env.dataProvider === 'mock',
  };
}
