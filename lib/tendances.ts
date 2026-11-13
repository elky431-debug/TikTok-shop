import { getLiveCatalog, isDemoProduct } from '@/lib/catalog';
import { getRepo, type Repo } from '@/lib/db';
import type { Product, Trend } from '@/lib/db/types';
import { mapWithConcurrency } from '@/lib/jobs/concurrency';
import { NICHES, isNicheId, type NicheId } from '@/lib/niches';
import { commissionPerSale } from '@/lib/score';
import { parisDate } from '@/lib/utils';

/**
 * Produits « de la veille » : ce que voient les non-abonnés (salon Discord public, pages publiques /tendances).
 * Les abonnés ont le relevé du jour dans l'appli ; le public a celui d'avant, sans score ni script.
 *
 * - Relevé du jour pas encore fait (la nuit n'est pas passée) : le catalogue affiché EST la veille.
 * - Relevé du jour fait : on relit, pour chaque produit, son dernier instantané antérieur à aujourd'hui
 *   (`product_snapshots`), on garde ceux du relevé précédent et on les classe par le score de ce jour-là.
 *   Calculé une fois par jour, puis gardé dans le cache serveur (`provider_cache`, illisible du navigateur).
 * - Jamais de produits fictifs présentés comme réels : sans `includeDemo`, une base fictive donne une sélection vide.
 */

/** En dessous de ce nombre de vrais produits, une catégorie n'est ni publiée ni listée dans le plan du site. */
export const MIN_PRODUCTS_PER_NICHE = 5;
/** Produits montrés par page de catégorie. */
export const MAX_PRODUCTS_PER_PAGE = 12;

export interface TrendEntry {
  id: string;
  name: string;
  niche: NicheId;
  shop_name: string;
  image_url: string;
  price_cents: number;
  commission_rate: number;
  commission_cents: number;
  trend: Trend;
  growth_7d: number;
  /** false = croissance pas encore mesurable : l'affichage dit « tendance en mesure ». */
  growth_known: boolean;
  /** Sert au classement seulement : jamais affiché publiquement. */
  rank_value: number;
}

export interface VeilleSelection {
  /** Jour du relevé montré (AAAA-MM-JJ), null s'il n'y a rien. */
  date: string | null;
  demo: boolean;
  products: TrendEntry[];
}

const EMPTY: VeilleSelection = { date: null, demo: false, products: [] };

function entryFrom(product: Product, snapshot?: { score: number; trend: Trend; growth: number | null }): TrendEntry {
  const growth = snapshot ? snapshot.growth : (product.latest_breakdown?.growth_7d ?? null);
  return {
    id: product.id,
    name: product.name,
    niche: product.niche,
    shop_name: product.shop_name,
    image_url: product.image_url,
    price_cents: product.price_cents,
    commission_rate: product.commission_rate,
    commission_cents: commissionPerSale(product.price_cents, product.commission_rate),
    trend: snapshot?.trend ?? product.trend,
    growth_7d: growth ?? 0,
    growth_known: growth !== null,
    rank_value: snapshot?.score ?? product.latest_score,
  };
}

const byRank = (a: TrendEntry, b: TrendEntry) => b.rank_value - a.rank_value || a.id.localeCompare(b.id);

/** Clé du cache serveur : un calcul par jour (et par nature de données). */
export const veilleCacheKey = (today: string, demo: boolean) => `tendances:veille:FR:${today}:${demo ? 'demo' : 'reel'}`;

export async function getVeilleSelection(
  repo: Repo = getRepo(),
  now: Date = new Date(),
  opts: { includeDemo?: boolean } = {},
): Promise<VeilleSelection> {
  const catalog = await getLiveCatalog(repo, now, 'FR');
  const products = catalog.products.filter((p) => isNicheId(p.niche));
  if (!products.length || !catalog.dataDate) return EMPTY;
  if (catalog.demo && !opts.includeDemo) return { ...EMPTY, demo: true };
  const real = products.filter((p) => !isDemoProduct(p));
  const pool = catalog.demo ? products : real;
  const today = parisDate(now);

  // La nuit n'est pas encore passée : le catalogue montré est déjà celui de la veille (ou plus ancien).
  if (catalog.dataDate < today) {
    return { date: catalog.dataDate, demo: catalog.demo, products: pool.map((p) => entryFrom(p)).sort(byRank) };
  }

  const key = veilleCacheKey(today, catalog.demo);
  const cached = (await repo.getProviderCache(key).catch(() => null)) as VeilleSelection | null;
  if (cached && Array.isArray(cached.products)) return cached;

  const previous = await mapWithConcurrency(pool, 8, async (product) => {
    const snapshots = await repo.getProductSnapshots(product.id, 8);
    const before = snapshots.filter((s) => s.date < today).at(-1);
    return before ? { product, before } : null;
  });
  const found = previous.filter((x): x is NonNullable<typeof x> => x !== null);
  const date = found.reduce<string | null>((max, x) => (!max || x.before.date > max ? x.before.date : max), null);
  const selection: VeilleSelection = {
    date,
    demo: catalog.demo,
    products: found
      .filter((x) => x.before.date === date)
      .map((x) => entryFrom(x.product, { score: x.before.score, trend: x.before.trend, growth: x.before.score_breakdown?.growth_7d ?? null }))
      .sort(byRank),
  };
  // Gardé jusqu'au lendemain midi (heure UTC) : un seul calcul par jour, même avec beaucoup de visites.
  const expires = new Date(`${today}T12:00:00Z`);
  expires.setUTCDate(expires.getUTCDate() + 1);
  await repo.setProviderCache(key, selection, expires.toISOString()).catch(() => undefined);
  return selection;
}

/** Produits d'une catégorie, classés, limités à une page. */
export function nicheEntries(selection: VeilleSelection, niche: NicheId, limit = MAX_PRODUCTS_PER_PAGE): TrendEntry[] {
  return selection.products.filter((p) => p.niche === niche).slice(0, limit);
}

/**
 * Catégories publiées : assez de vrais produits (MIN_PRODUCTS_PER_NICHE), jamais de fictif. Une catégorie qui n'y est
 * pas n'a pas de page (404) et n'est pas dans le plan du site : aucune page vide ou presque vide.
 */
export function publishedNiches(selection: VeilleSelection): Array<{ id: NicheId; label: string; short: string; count: number }> {
  if (selection.demo) return [];
  return NICHES.map((n) => ({ id: n.id, label: n.label, short: n.short, count: selection.products.filter((p) => p.niche === n.id).length })).filter(
    (n) => n.count >= MIN_PRODUCTS_PER_NICHE,
  );
}

export function isPublishedNiche(selection: VeilleSelection, niche: string): niche is NicheId {
  return isNicheId(niche) && publishedNiches(selection).some((n) => n.id === niche);
}

/** Données structurées schema.org : liste ordonnée des produits de la page (nom seulement, aucun chiffre inventé). */
export function itemListJsonLd(input: { name: string; url: string; entries: TrendEntry[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    url: input.url,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: input.entries.length,
    itemListElement: input.entries.map((entry, i) => ({ '@type': 'ListItem', position: i + 1, name: entry.name })),
  };
}

/** JSON sûr dans une balise <script> (aucune fermeture de balise possible). */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
