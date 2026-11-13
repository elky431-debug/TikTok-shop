import { getLiveCatalog } from '@/lib/catalog';
import type { Repo } from '@/lib/db';
import type { Product } from '@/lib/db/types';
import { notify } from '@/lib/notify';
import { isPaidPlan } from '@/lib/plans';
import { regionFor } from '@/lib/regions';
import { addDays, formatGrowth } from '@/lib/utils';

/**
 * Produits suivis qui commencent à baisser : tendance « baisse » du score, croissance 7 jours ≤ −15 %, ou chute des
 * ventes de la dernière semaine (−30 % ou plus face à la semaine d'avant, d'après nos relevés quotidiens).
 * Remplaçants proposés : même niche, meilleur score, dans le catalogue du jour, pas déjà suivis.
 */
export const DECLINE_GROWTH = -0.15;
export const SALES_DROP = -0.3;
/** Pas de nouvelle alerte pour un même produit avant ce délai. */
export const ALERT_COOLDOWN_DAYS = 14;
export const DECLINE_ALERT_KIND = 'alerte_baisse';

/** Variation des ventes : 7 derniers jours connus face aux 7 d'avant. null si l'historique est trop court. */
export function salesDrop(sales: number[]): number | null {
  if (sales.length < 14) return null;
  const last = sales.slice(-7).reduce((s, v) => s + v, 0);
  const previous = sales.slice(-14, -7).reduce((s, v) => s + v, 0);
  if (previous < 7) return null; // moins d'une vente par jour : variation sans signification
  return last / previous - 1;
}

export type DeclineReason = 'tendance' | 'croissance' | 'ventes';

export function declineReason(product: Pick<Product, 'trend' | 'growth_7d' | 'sales_30d' | 'latest_breakdown'>): DeclineReason | null {
  if (product.trend === 'baisse') return 'tendance';
  const measured = product.latest_breakdown?.growth_7d !== null && product.latest_breakdown?.growth_7d !== undefined;
  if (measured && product.growth_7d <= DECLINE_GROWTH) return 'croissance';
  const drop = salesDrop(product.sales_30d ?? []);
  if (drop !== null && drop <= SALES_DROP) return 'ventes';
  return null;
}

export const isDeclining = (product: Parameters<typeof declineReason>[0]) => declineReason(product) !== null;

export function declineSentence(product: Parameters<typeof declineReason>[0]): string {
  const reason = declineReason(product);
  if (reason === 'ventes') {
    const drop = salesDrop(product.sales_30d) ?? 0;
    return `Ventes en recul de ${formatGrowth(drop).replace('−', '')} sur 7 jours face à la semaine d’avant.`;
  }
  if (reason === 'croissance' || reason === 'tendance') return `Croissance sur 7 jours : ${formatGrowth(product.growth_7d)}.`;
  return '';
}

/** Jusqu'à `limit` produits de la même niche, mieux notés, qui ne baissent pas, hors produits exclus. */
export function findReplacements(product: Pick<Product, 'id' | 'niche' | 'latest_score'>, catalog: Product[], exclude: Set<string>, limit = 3): Product[] {
  return catalog
    .filter((p) => p.niche === product.niche && p.id !== product.id && !exclude.has(p.id) && p.latest_score > product.latest_score && !isDeclining(p))
    .sort((a, b) => b.latest_score - a.latest_score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

interface AlertMemory {
  product_id: string;
  alerted_on: string;
}

/**
 * Tâche nocturne : une notification « baisse » par produit suivi qui commence à baisser, au plus une fois tous les
 * 14 jours par produit. Remplaçants nommés pour Pro et Pro+ seulement (le plan Gratuit ne voit que 3 produits du
 * jour : on ne les contourne pas par une alerte). Canaux : centre de notifications et push, e-mail si l'utilisateur
 * reçoit le récap par e-mail. Pas de message Discord la nuit.
 */
export async function alertDecliningProducts(date: string, repo: Repo, now = new Date()): Promise<{ alerts: number; checked: number }> {
  const all = await repo.listProducts();
  const byId = new Map(all.map((p) => [p.id, p]));
  const catalogs = new Map<string, Product[]>();
  let alerts = 0;
  let checked = 0;
  for (const profile of await repo.listOnboardedProfiles()) {
    const saved = await repo.listSavedProducts(profile.id);
    if (!saved.length) continue;
    const region = regionFor(profile);
    if (!catalogs.has(region)) catalogs.set(region, (await getLiveCatalog(repo, now, region)).products);
    const catalog = catalogs.get(region)!;
    const followed = new Set(saved.map((s) => s.product_id));
    const memory = await repo.listRecords<AlertMemory>(profile.id, DECLINE_ALERT_KIND);
    for (const row of saved) {
      const product = byId.get(row.product_id);
      // Produit absent des relevés récents : on ne sait pas, on ne dit rien.
      if (!product?.snapshot_date || product.snapshot_date < addDays(date, -2)) continue;
      checked++;
      if (!isDeclining(product) || row.videos_posted >= row.video_goal) continue;
      const last = memory.find((m) => m.data.product_id === product.id);
      if (last && last.data.alerted_on > addDays(date, -ALERT_COOLDOWN_DAYS)) continue;
      const replacements = isPaidPlan(profile.plan) ? findReplacements(product, catalog, followed) : [];
      const body = [
        `${product.name} commence à baisser. ${declineSentence(product)}`,
        'Publie vite les vidéos que tu as déjà tournées.',
        replacements.length
          ? `À regarder dans la même niche : ${replacements.map((r) => `${r.name} (score ${r.latest_score})`).join(', ')}.`
          : 'Ouvre le radar pour choisir le suivant.',
      ].join('\n');
      const sent = await notify(
        profile.id,
        {
          type: 'baisse',
          title: `${product.name.slice(0, 60)} commence à baisser`,
          body,
          path: `/app/mes-produits/${encodeURIComponent(product.id)}`,
          action: 'Voir mes produits',
          channels: { push: true, email: profile.digest_email, discord: false },
          dedupeKey: `baisse:${product.id}:${date}`,
        },
        repo,
      );
      if (!sent) continue;
      await repo.saveRecord<AlertMemory>(profile.id, DECLINE_ALERT_KIND, { product_id: product.id, alerted_on: date }, last?.id);
      alerts++;
    }
  }
  return { alerts, checked };
}
