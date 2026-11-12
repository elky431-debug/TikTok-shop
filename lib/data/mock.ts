import type { TopVideo } from '@/lib/db/types';
import { NICHE_IDS, type NicheId } from '@/lib/niches';
import { addDays, dateRange, daysBetween, parisDate } from '@/lib/utils';
import { CATALOG, NICHE_DESCRIPTIONS, SHOP_PREFIXES, SHOP_SUFFIXES, VIDEO_TEMPLATES } from './catalog-fr';
import type { ProductDataProvider, ProviderProduct, SalesPoint, TrendingQuery } from './provider';
import { noise, Rng } from './random';

/**
 * Fournisseur fictif déterministe : ~200 produits réalistes pour la France.
 * Même graine ⇒ mêmes produits et mêmes courbes. Les courbes dépendent du jour absolu,
 * donc l'historique d'hier est cohérent avec « aujourd'hui » vu hier.
 */

const SEED = 'tiktrend-fr-v1';
const EPOCH = '2024-01-01'; // un lundi

type Archetype = 'vague' | 'fond';

interface MockSpec {
  id: string;
  niche: NicheId;
  name: string;
  detail: string;
  description: string;
  shop: string;
  price_cents: number;
  commission_rate: number;
  free_sample: boolean;
  archetype: Archetype;
  base: number; // ventes/jour au sommet
  cycle: number; // jours
  phase: number; // décalage dans le cycle
  rise: number; // jours de montée
  plateau: number; // jours au sommet
  halfLife: number; // demi-vie du déclin
  floor: number; // niveau de fond (0..1)
  wavePeriod: number; // produits de fond : période de la vague lente
  affMin: number;
  affMax: number;
}

const BASE_SALES: Record<NicheId, [number, number]> = {
  beaute: [40, 900],
  maison: [25, 600],
  mode: [20, 450],
  tech: [15, 420],
  sport: [15, 350],
  animaux: [12, 300],
  bebe: [8, 220],
};

function buildSpecs(): MockSpec[] {
  const specs: MockSpec[] = [];
  for (const niche of NICHE_IDS) {
    CATALOG[niche].forEach(([name, price, detail], index) => {
      const id = `fr-${niche}-${String(index + 1).padStart(3, '0')}`;
      const rng = new Rng(`${SEED}|${id}`);
      const [minBase, maxBase] = BASE_SALES[niche];
      const priceFactor = Math.min(1.4, Math.max(0.35, Math.sqrt(25 / price)));
      const base = rng.logUniform(minBase, maxBase) * priceFactor;
      const archetype: Archetype = rng.bool(0.72) ? 'vague' : 'fond';
      const explosive = rng.bool(0.4);
      specs.push({
        id,
        niche,
        name,
        detail,
        description: `${detail}. ${rng.pick(NICHE_DESCRIPTIONS[niche])}`,
        shop: `${rng.pick(SHOP_PREFIXES)} ${rng.pick(SHOP_SUFFIXES)}`,
        price_cents: Math.round(price * 100),
        commission_rate: Math.round(rng.float(niche === 'beaute' ? 0.1 : 0.05, 0.3) * 100) / 100,
        free_sample: rng.bool(0.36),
        archetype,
        base,
        cycle: rng.int(60, 130),
        phase: rng.int(0, 200),
        rise: explosive ? rng.int(4, 8) : rng.int(10, 24),
        plateau: rng.int(4, 22),
        halfLife: rng.int(5, 18),
        floor: rng.float(0.06, 0.16),
        wavePeriod: rng.int(35, 75),
        affMin: rng.int(3, 25),
        affMax: base * rng.logUniform(0.06, 2.6),
      });
    });
  }
  return specs;
}

let cachedSpecs: MockSpec[] | null = null;
function specs(): MockSpec[] {
  cachedSpecs ??= buildSpecs();
  return cachedSpecs;
}

function specById(id: string): MockSpec | undefined {
  return specs().find((s) => s.id === id);
}

/** Niveau de cycle de vie (0..1) au jour absolu t. */
function lifecycle(spec: MockSpec, t: number): number {
  if (spec.archetype === 'fond') {
    const wave = Math.sin(((t + spec.phase) / spec.wavePeriod) * Math.PI * 2);
    return 0.62 + 0.18 * wave;
  }
  const x = (((t + spec.phase) % spec.cycle) + spec.cycle) % spec.cycle;
  if (x < spec.rise) {
    const k = 1 / (1 + Math.exp(-9 * (x / spec.rise - 0.55)));
    return spec.floor + (1 - spec.floor) * k;
  }
  if (x < spec.rise + spec.plateau) {
    return 0.94 + 0.06 * Math.sin(x);
  }
  const decay = Math.exp((-Math.LN2 * (x - spec.rise - spec.plateau)) / spec.halfLife);
  return Math.max(spec.floor, decay);
}

function dayIndex(date: string): number {
  return daysBetween(EPOCH, date);
}

function salesOn(spec: MockSpec, t: number): number {
  const dow = ((t % 7) + 7) % 7; // 0 = lundi
  const weekly = dow >= 5 ? 1.12 : dow === 0 ? 0.94 : 1;
  const jitter = 0.86 + 0.28 * noise(`${spec.id}|v|${t}`);
  return Math.max(0, Math.round(spec.base * lifecycle(spec, t) * weekly * jitter));
}

function affiliatesOn(spec: MockSpec, t: number): number {
  // Les affiliés arrivent avec retard : moyenne du cycle de vie entre J-14 et J-3.
  let sum = 0;
  for (let d = 3; d <= 14; d++) sum += lifecycle(spec, t - d);
  const lagged = sum / 12;
  const jitter = 0.95 + 0.1 * noise(`${spec.id}|a|${t}`);
  return Math.max(1, Math.round((spec.affMin + spec.affMax * Math.pow(lagged, 1.3)) * jitter));
}

function toProviderProduct(spec: MockSpec, date: string): ProviderProduct {
  const t = dayIndex(date);
  return {
    id: spec.id,
    name: spec.name,
    niche: spec.niche,
    description: spec.description,
    shop_name: spec.shop,
    price_cents: spec.price_cents,
    commission_rate: spec.commission_rate,
    free_sample: spec.free_sample,
    active_affiliates: affiliatesOn(spec, t),
    image_url: `/api/produit-image/${spec.id}`,
    estimated_sales: salesOn(spec, t),
  };
}

export class MockProvider implements ProductDataProvider {
  readonly name = 'mock' as const;

  async fetchTrendingProducts(query: TrendingQuery): Promise<ProviderProduct[]> {
    return specs()
      .filter((s) => !query.category || s.niche === query.category)
      .map((s) => toProviderProduct(s, query.date));
  }

  async fetchProductHistory(productId: string, days: number, endDate: string = parisDate()): Promise<SalesPoint[]> {
    const spec = specById(productId);
    if (!spec) return [];
    return dateRange(endDate, days).map((date) => {
      const t = dayIndex(date);
      return { date, estimated_sales: salesOn(spec, t), affiliates: affiliatesOn(spec, t) };
    });
  }

  async fetchTopVideos(productId: string): Promise<TopVideo[]> {
    const spec = specById(productId);
    if (!spec) return [];
    const rng = new Rng(`${SEED}|videos|${productId}`);
    const count = rng.int(3, 5);
    const templates = rng.shuffle(VIDEO_TEMPLATES).slice(0, count);
    const quoted = `«\u00a0${spec.name}\u00a0»`;
    return templates
      .map((tpl) => {
        const views = Math.round(rng.logUniform(15_000, 2_400_000) * (spec.base / 300));
        return {
          title: tpl.title.replace('{produit}', quoted),
          views: Math.max(4_000, views),
          estimated_sales: Math.max(5, Math.round(views * rng.float(0.0006, 0.004))),
          hook: tpl.hook,
          format: tpl.format,
        };
      })
      .sort((a, b) => b.estimated_sales - a.estimated_sales);
  }

  /** Utilitaire pour le seed : jour précédent. */
  static previousDay(date: string): string {
    return addDays(date, -1);
  }
}
