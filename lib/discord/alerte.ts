import type { Repo } from '@/lib/db';
import type { Product, Profile } from '@/lib/db/types';
import { isNicheId, nicheLabel, type NicheId } from '@/lib/niches';
import { getPlan } from '@/lib/plans';
import { formatGrowth, formatInt } from '@/lib/utils';

/**
 * Fiche `alerte` (table générique `user_records`, kind = 'alerte'), même format dans l'appli et dans Discord :
 *
 *   { niche, minCommissionPercent, minSales7d, minGrowth, active }
 *
 * - niche : identifiant de niche (« beaute », « maison »…) ou null = toutes les niches ;
 * - minCommissionPercent : commission minimale en pourcentage du prix (15 = 15 %), 0 = pas de minimum ;
 * - minSales7d : ventes minimales cumulées sur les 7 derniers jours (unités), null = pas de condition ;
 * - minGrowth : croissance minimale sur 7 jours, en ratio comme `Product.growth_7d` (0.2 = +20 %), null = pas de
 *   condition ; un produit dont la croissance n'est pas encore mesurable ne la remplit pas ;
 * - active : false = alerte en pause (ne compte pas dans la limite du plan).
 * Nombre d'alertes actives : `PLANS[plan].alerts` (0 en Gratuit, 3 en Pro, illimité en Pro+).
 */
export const ALERT_KIND = 'alerte';

export interface AlerteData {
  niche: NicheId | null;
  minCommissionPercent: number;
  minSales7d: number | null;
  minGrowth: number | null;
  active: boolean;
}

/** Valide une fiche (appli, Discord ou base) ; null si elle n'a pas le bon format. */
export function parseAlerte(input: unknown): AlerteData | null {
  if (!input || typeof input !== 'object') return null;
  const a = input as Record<string, unknown>;
  const niche = a.niche === null || a.niche === undefined ? null : isNicheId(a.niche) ? a.niche : undefined;
  if (niche === undefined) return null;
  const commission = Number(a.minCommissionPercent);
  if (!Number.isFinite(commission) || commission < 0 || commission > 100) return null;
  const sales = a.minSales7d === null || a.minSales7d === undefined ? null : Number(a.minSales7d);
  if (sales !== null && (!Number.isFinite(sales) || sales < 0)) return null;
  const growth = a.minGrowth === null || a.minGrowth === undefined ? null : Number(a.minGrowth);
  if (growth !== null && (!Number.isFinite(growth) || growth < -1 || growth > 50)) return null;
  return { niche, minCommissionPercent: commission, minSales7d: sales === null ? null : Math.round(sales), minGrowth: growth, active: a.active !== false };
}

/** Ventes cumulées sur les 7 derniers jours connus ; null si l'historique ne le dit pas. */
export function sales7d(product: Pick<Product, 'sales_30d' | 'latest_breakdown'>): number | null {
  if (product.sales_30d.length >= 7) return product.sales_30d.slice(-7).reduce((s, n) => s + n, 0);
  const daily = product.latest_breakdown?.daily_sales_7d;
  return daily === null || daily === undefined ? null : Math.round(daily * 7);
}

/** Le produit remplit-il l'alerte ? (pour le moteur d'alertes de la nuit) */
export function matchesAlerte(product: Product, alert: AlerteData): boolean {
  if (!alert.active) return false;
  if (alert.niche && product.niche !== alert.niche) return false;
  if (product.commission_rate * 100 + 1e-9 < alert.minCommissionPercent) return false;
  if (alert.minSales7d !== null) {
    const sales = sales7d(product);
    if (sales === null || sales < alert.minSales7d) return false;
  }
  if (alert.minGrowth !== null) {
    const measured = product.latest_breakdown ? product.latest_breakdown.growth_7d !== null : true;
    if (!measured || product.growth_7d < alert.minGrowth) return false;
  }
  return true;
}

export function describeAlerte(alert: AlerteData): string {
  const parts = [
    alert.niche ? nicheLabel(alert.niche) : 'Toutes les niches',
    `commission ≥ ${String(alert.minCommissionPercent).replace('.', ',')} %`,
    alert.minSales7d !== null ? `ventes sur 7 jours ≥ ${formatInt(alert.minSales7d)}` : null,
    alert.minGrowth !== null ? `croissance sur 7 jours ≥ ${formatGrowth(alert.minGrowth)}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Crée une alerte en respectant la limite d'alertes actives du plan (côté serveur). */
export async function createAlerte(
  profile: Profile,
  input: AlerteData,
  repo: Repo,
): Promise<{ ok: true; id: string; active: number; limit: number } | { ok: false; message: string }> {
  const limit = getPlan(profile.plan).alerts;
  if (limit <= 0) {
    return { ok: false, message: 'Les alertes arrivent avec le plan Pro (3 alertes) ou Pro+ (illimitées).' };
  }
  const alert = parseAlerte(input);
  if (!alert) return { ok: false, message: 'Alerte invalide : vérifie la niche et les nombres.' };
  const existing = (await repo.listRecords<AlerteData>(profile.id, ALERT_KIND)).map((r) => parseAlerte(r.data)).filter((a) => a?.active);
  if (existing.length >= limit) {
    return {
      ok: false,
      message: `Tu as déjà ${existing.length} alertes actives, le maximum du plan ${getPlan(profile.plan).name}. Mets-en une en pause dans l’appli${profile.plan === 'pro' ? ', ou passe Pro+ pour en avoir autant que tu veux' : ''}.`,
    };
  }
  const record = await repo.saveRecord<AlerteData>(profile.id, ALERT_KIND, alert);
  return { ok: true, id: record.id, active: existing.length + 1, limit };
}
