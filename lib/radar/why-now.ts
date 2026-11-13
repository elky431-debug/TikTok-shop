import { z } from 'zod';
import { findIssues } from '@/lib/ai/guard';
import { askStructured } from '@/lib/ai/structured';
import { getLiveCatalog } from '@/lib/catalog';
import { getRepo, type Repo } from '@/lib/db';
import type { Product, RegionId } from '@/lib/db/types';
import { isAiConfigured } from '@/lib/env';
import { nicheShort } from '@/lib/niches';
import { enabledRegions } from '@/lib/regions';
import { formatEuros, formatGrowth, formatInt } from '@/lib/utils';
import { BADGES, badgesFor } from './badges';
import { productMetrics, type ProductMetrics } from './metrics';

/**
 * « Pourquoi maintenant » : une phrase par produit, écrite par l'IA à partir des chiffres seulement, une fois par
 * produit et par jour, partagée entre tous les utilisateurs (cache serveur `provider_cache`, une entrée par pays et par
 * jour). Sans clé d'IA : phrase simulée, déterministe, calculée sur les mêmes chiffres.
 *
 * Contrôles sur la phrase de l'IA : longueur, garde-fou des textes générés (promesses, superlatifs, gains), et chaque
 * nombre cité doit figurer dans les chiffres fournis. Sinon, la phrase calculée la remplace (source « calcul »).
 */
export interface WhyNow {
  sentence: string;
  source: 'ia' | 'simulation' | 'calcul';
}

export type WhyNowMap = Record<string, WhyNow>;

const CACHE_PREFIX = 'pourquoi-maintenant';
const CACHE_HOURS = 48;
const BATCH = 15;
const MAX_LENGTH = 220;

export const whyNowCacheKey = (region: RegionId, date: string) => `${CACHE_PREFIX}|${region}|${date}`;

const round = (n: number) => (n >= 100 ? Math.round(n / 10) * 10 : Math.round(n));

/** Les chiffres d'un produit, tels qu'on les montre (ce sont les seuls que la phrase peut citer). */
export function whyNowFacts(product: Product, metrics: ProductMetrics = productMetrics(product)): string[] {
  const lines = [
    `id : ${product.id}`,
    `produit : ${product.name.slice(0, 80)}`,
    `niche : ${nicheShort(product.niche)}`,
    `prix : ${formatEuros(product.price_cents)}`,
    `commission par vente : ${formatEuros(metrics.commission_cents)} (${Math.round(product.commission_rate * 100)} %)`,
  ];
  if (metrics.daily_sales !== null) lines.push(`ventes par jour, moyenne sur 7 jours : ${formatInt(round(metrics.daily_sales))}`);
  if (metrics.growth_7d !== null) lines.push(`croissance des ventes sur 7 jours : ${formatGrowth(metrics.growth_7d)}`);
  if (metrics.affiliates !== null) lines.push(`affiliés : ${formatInt(metrics.affiliates)}`);
  if (metrics.sales_30d !== null) lines.push(`ventes sur 30 jours : ${formatInt(metrics.sales_30d)}`);
  if (metrics.age_days !== null) lines.push(`vu pour la première fois par la source il y a : ${metrics.age_days} jours`);
  if (metrics.pace.recent !== null && metrics.pace.month !== null) {
    lines.push(`ventes par jour, derniers jours : ${formatInt(round(metrics.pace.recent))} ; sur 30 jours : ${formatInt(round(metrics.pace.month))}`);
  }
  if (metrics.rating !== null) lines.push(`note : ${String(metrics.rating).replace('.', ',')} sur 5${metrics.review_count !== null ? ` (${formatInt(metrics.review_count)} avis)` : ''}`);
  const badges = badgesFor(metrics).map((b) => BADGES[b].label);
  if (badges.length) lines.push(`signaux : ${badges.join(', ')}`);
  return lines;
}

/** Phrase calculée sur les chiffres (sans IA) : simulation honnête, toujours vraie. */
export function computedWhyNow(product: Product, m: ProductMetrics = productMetrics(product)): string {
  const badges = badgesFor(m);
  const daily = m.daily_sales !== null ? formatInt(round(m.daily_sales)) : null;
  const perSale = formatEuros(m.commission_cents);
  if (badges.includes('baisse')) {
    return m.growth_7d !== null
      ? `Ventes en baisse (${formatGrowth(m.growth_7d)} sur 7 jours) : attends un rebond avant de t’y mettre.`
      : 'Les ventes de la semaine sont sous celles du mois : attends un rebond avant de t’y mettre.';
  }
  if (badges.includes('nouveau') && m.age_days !== null) {
    return daily && (m.daily_sales ?? 0) >= 5
      ? `Arrivé il y a ${m.age_days} jours et déjà environ ${daily} ventes par jour : peu de créateurs ont eu le temps de s’y mettre.`
      : `Arrivé il y a ${m.age_days} jours : peu de recul, surveille ses ventes cette semaine.`;
  }
  if (badges.includes('acceleration') && m.pace.recent !== null && m.pace.month !== null) {
    return `Les ventes accélèrent : environ ${formatInt(round(m.pace.recent))} par jour ces derniers jours, contre ${formatInt(round(m.pace.month))} sur le mois.`;
  }
  if (badges.includes('sous_exploite') && m.affiliates !== null) {
    return `Environ ${daily} ventes par jour pour seulement ${formatInt(m.affiliates)} affiliés : il reste de la place.`;
  }
  if (badges.includes('sature') && m.affiliates !== null) {
    return `Déjà ${formatInt(m.affiliates)} affiliés pour environ ${daily} ventes par jour : il te faudra un angle qui se démarque.`;
  }
  if (m.growth_7d !== null && m.growth_7d >= 0.1) {
    return `Ventes en hausse de ${formatGrowth(m.growth_7d)} sur 7 jours${daily ? ` (environ ${daily} par jour)` : ''} : la demande monte en ce moment.`;
  }
  if (m.growth_7d === null) {
    return `Tendance encore en mesure, avec ${perSale} par vente (${Math.round(m.commission_rate * 100)} %) : garde-le à l’œil.`;
  }
  return `Ventes stables${daily ? ` (environ ${daily} par jour)` : ''} et ${perSale} par vente : un produit régulier, sans urgence.`;
}

/** Nombres d'un texte, normalisés (« 1 200 » → 1200, « 12,90 » → 12.9). */
export function numbersIn(text: string): number[] {
  const compact = text.replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1');
  return [...compact.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
}

/** La phrase de l'IA est-elle utilisable ? (longueur, garde-fou, aucun nombre absent des chiffres fournis) */
export function isValidWhyNow(sentence: string, facts: string[]): boolean {
  const text = sentence.trim();
  if (text.length < 20 || text.length > MAX_LENGTH) return false;
  // Le mot « commission » est un fait ici, pas une promesse : seul le reste du garde-fou s'applique.
  if (findIssues(text.replace(/commissions?/gi, 'part')).length) return false;
  const allowed = new Set(numbersIn(facts.filter((line) => !line.startsWith('id :')).join('\n')));
  return numbersIn(text).every((n) => allowed.has(n));
}

const SYSTEM = `Tu écris pour des créateurs affiliés TikTok Shop en France. Pour chaque produit, écris UNE phrase (25 mots
au plus) qui dit pourquoi c'est le moment, ou pas, de faire des vidéos dessus. Utilise uniquement les chiffres fournis,
écrits comme ils te sont donnés : n'en invente aucun et n'en calcule pas de nouveaux. Si un chiffre manque, n'en parle pas.
Tutoiement, ton direct, français simple, pas de mot anglais. Aucune promesse de gains ni de résultat, pas de superlatif.`;

const Schema = z.object({ items: z.array(z.object({ id: z.string(), phrase: z.string() })) });

/** Génère les phrases d'une liste de produits (par lots de 15 avec l'IA). */
export async function generateWhyNow(products: Product[]): Promise<WhyNowMap> {
  const result: WhyNowMap = {};
  const prepared = products.map((product) => {
    const metrics = productMetrics(product);
    return { product, facts: whyNowFacts(product, metrics), computed: computedWhyNow(product, metrics) };
  });
  if (!isAiConfigured()) {
    for (const p of prepared) result[p.product.id] = { sentence: p.computed, source: 'simulation' };
    return result;
  }
  for (let i = 0; i < prepared.length; i += BATCH) {
    const batch = prepared.slice(i, i + BATCH);
    let phrases = new Map<string, string>();
    let simulated = false;
    try {
      const answer = await askStructured({
        name: 'pourquoi_maintenant',
        schema: Schema,
        system: SYSTEM,
        prompt: `${batch.map((p) => p.facts.join('\n')).join('\n\n')}\n\nRéponds avec une phrase par identifiant.`,
        maxTokens: 3000,
        simulate: () => ({ items: batch.map((p) => ({ id: p.product.id, phrase: p.computed })) }),
      });
      simulated = answer.simulated;
      phrases = new Map(answer.data.items.map((item) => [item.id, item.phrase.trim()]));
    } catch (error) {
      console.warn('[pourquoi maintenant]', error instanceof Error ? error.message : error);
    }
    for (const p of batch) {
      const phrase = phrases.get(p.product.id);
      result[p.product.id] =
        phrase && isValidWhyNow(phrase, p.facts)
          ? { sentence: phrase, source: simulated ? 'simulation' : 'ia' }
          : { sentence: p.computed, source: simulated ? 'simulation' : 'calcul' };
    }
  }
  return result;
}

function asMap(value: unknown): WhyNowMap {
  if (!value || typeof value !== 'object') return {};
  const out: WhyNowMap = {};
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    const e = entry as Partial<WhyNow> | null;
    if (e && typeof e.sentence === 'string' && (e.source === 'ia' || e.source === 'simulation' || e.source === 'calcul')) {
      out[id] = { sentence: e.sentence, source: e.source };
    }
  }
  return out;
}

export async function readWhyNow(region: RegionId, date: string, repo: Repo = getRepo()): Promise<WhyNowMap> {
  return asMap(await repo.getProviderCache(whyNowCacheKey(region, date)));
}

/**
 * Phrases du jour pour ces produits : lues dans le cache, les manquantes générées puis ajoutées au cache.
 * Avec une vraie IA, `allowAi` doit être vrai (tâche de nuit, fiche produit) ; chaque produit est réservé pour la
 * journée avant l'appel, pour qu'un produit ne soit jamais généré deux fois le même jour.
 */
export async function ensureWhyNow(
  products: Product[],
  region: RegionId,
  date: string,
  options: { repo?: Repo; allowAi?: boolean } = {},
): Promise<WhyNowMap> {
  const repo = options.repo ?? getRepo();
  const cached = await readWhyNow(region, date, repo);
  let missing = products.filter((p) => !cached[p.id]);
  if (!missing.length) return cached;
  const ai = isAiConfigured();
  if (ai && !options.allowAi) return cached;
  if (ai) {
    const claimed: Product[] = [];
    for (const p of missing) if (await repo.claimDailyTask(`pourquoi:${region}:${p.id}`, date)) claimed.push(p);
    missing = claimed;
    if (!missing.length) return cached;
  }
  const fresh = await generateWhyNow(missing);
  // Relu juste avant l'écriture : une autre exécution a pu ajouter des phrases entre-temps.
  const merged = { ...(await readWhyNow(region, date, repo)), ...fresh };
  const expires = new Date(Date.now() + CACHE_HOURS * 3_600_000).toISOString();
  await repo.setProviderCache(whyNowCacheKey(region, date), merged, expires);
  return merged;
}

/**
 * Phrase d'un produit pour sa fiche : celle du jour si elle existe, sinon générée maintenant (réservée pour la journée).
 * Si l'IA tarde (plus de `timeoutMs`), la fiche s'affiche avec la phrase calculée, sans attendre ; la phrase de l'IA
 * sera dans le cache pour les visites suivantes.
 */
export async function whyNowForProduct(
  product: Product,
  region: RegionId,
  date: string | null,
  options: { repo?: Repo; timeoutMs?: number } = {},
): Promise<WhyNow> {
  const computed: WhyNow = { sentence: computedWhyNow(product), source: isAiConfigured() ? 'calcul' : 'simulation' };
  if (!date) return computed;
  const pending = ensureWhyNow([product], region, date, { repo: options.repo, allowAi: true })
    .then((map) => map[product.id] ?? computed)
    .catch(() => computed);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<WhyNow>((resolve) => {
    timer = setTimeout(() => resolve(computed), options.timeoutMs ?? 8000);
  });
  const result = await Promise.race([pending, timeout]);
  clearTimeout(timer);
  return result;
}

/**
 * Tâche de nuit (à brancher après le relevé) : prépare les phrases de tout le catalogue du jour, pays par pays.
 * Renvoie un résumé pour l'historique des tâches.
 */
export async function prepareWhyNow(date: string, repo: Repo = getRepo()): Promise<Record<string, number>> {
  const summary: Record<string, number> = { produits: 0, ia: 0, simulation: 0, calcul: 0 };
  for (const region of enabledRegions()) {
    const catalog = await getLiveCatalog(repo, new Date(), region);
    if (!catalog.products.length || catalog.dataDate !== date) continue;
    const map = await ensureWhyNow(catalog.products, region, date, { repo, allowAi: true });
    for (const p of catalog.products) {
      const entry = map[p.id];
      if (!entry) continue;
      summary.produits++;
      summary[entry.source]++;
    }
  }
  return summary;
}
