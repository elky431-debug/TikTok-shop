import { getLiveCatalog } from '@/lib/catalog';
import { getRepo, type Repo } from '@/lib/db';
import type { Product, Profile, RegionId, UserRecord } from '@/lib/db/types';
import { nicheLabel, nicheShort } from '@/lib/niches';
import { notify } from '@/lib/notify';
import { getPlan } from '@/lib/plans';
import { describeFilters, filtersToParams, filterTarget, hasFilters, matchesFilters, parseFilters, type RadarFilters } from '@/lib/radar-filters';
import { regionFor } from '@/lib/regions';
import { BADGES } from './badges';

/**
 * Alertes personnalisées (bloc 1) : une règle = des critères du radar (niche, commission, ventes, croissance, prix…).
 * Vérifiées après chaque relevé de nuit (`checkAlerts`, à brancher dans la tâche) : quand un produit se met à remplir
 * la règle, une notification part par push, e-mail et Discord (canaux choisis), une seule par alerte et par jour.
 * Limites côté serveur : Gratuit 0, Pro 3, Pro+ illimité (`alerts` dans lib/plans.ts) ; après un changement de plan,
 * seules les plus anciennes dans la limite restent vérifiées.
 */
export const ALERT_KIND = 'alerte';
const MAX_KNOWN = 300;

export interface AlertChannels {
  push: boolean;
  email: boolean;
  discord: boolean;
}

export interface AlertData {
  name: string;
  criteria: RadarFilters;
  active: boolean;
  channels: AlertChannels;
  region: RegionId;
  /** Produits qui remplissaient déjà la règle (pas de notification pour eux). */
  known_ids: string[];
  last_checked: string | null;
  last_sent: string | null;
  /** Produits qui remplissaient la règle au dernier relevé. */
  last_count: number;
}

export type AlertRecord = UserRecord<AlertData>;

/** Critères d'une alerte, lus d'un formulaire (mêmes noms que les filtres du radar). */
export function parseAlertCriteria(form: Record<string, string | undefined>): RadarFilters {
  const criteria = parseFilters(form);
  delete criteria.tendance;
  return criteria;
}

export function alertSummary(criteria: RadarFilters): string {
  const parts = describeFilters(criteria, { niche: (id) => nicheLabel(id).toLowerCase(), badge: (id) => BADGES[id].label });
  return parts.length ? parts.join(' · ') : 'tous les produits';
}

export function alertName(criteria: RadarFilters): string {
  const parts = describeFilters(criteria, { niche: (id) => nicheShort(id), badge: (id) => BADGES[id].label });
  const name = parts.slice(0, 2).join(', ');
  return (name.charAt(0).toUpperCase() + name.slice(1) || 'Alerte').slice(0, 60);
}

/** Produits du catalogue qui remplissent la règle. */
export function matchingProducts(products: Product[], criteria: RadarFilters): Product[] {
  return products.filter((p) => matchesFilters(filterTarget(p), criteria));
}

/** Alertes réellement vérifiées pour ce plan (les plus anciennes d'abord, dans la limite). */
export function activeAlertsWithinPlan(alerts: AlertRecord[], plan: Profile['plan']): AlertRecord[] {
  const limit = getPlan(plan).alerts;
  return alerts
    .filter((a) => a.data.active)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, Number.isFinite(limit) ? limit : undefined);
}

export type AlertError = 'plan' | 'limite' | 'criteres';

/** Crée une alerte : plan et limite vérifiés ici. Les produits qui remplissent déjà la règle sont notés comme connus. */
export async function createAlert(
  profile: Pick<Profile, 'id' | 'plan' | 'region'>,
  input: { name?: string; criteria: RadarFilters; channels: AlertChannels },
  repo: Repo = getRepo(),
): Promise<{ ok: true; alert: AlertRecord; matches: number } | { ok: false; error: AlertError }> {
  const limit = getPlan(profile.plan).alerts;
  if (!limit) return { ok: false, error: 'plan' };
  if (!hasFilters(input.criteria)) return { ok: false, error: 'criteres' };
  const existing = await repo.listRecords<AlertData>(profile.id, ALERT_KIND);
  if (existing.filter((a) => a.data.active).length >= limit) return { ok: false, error: 'limite' };
  const region = regionFor(profile);
  const { products } = await getLiveCatalog(repo, new Date(), region);
  const matches = matchingProducts(products, input.criteria);
  const alert = await repo.saveRecord<AlertData>(profile.id, ALERT_KIND, {
    name: (input.name?.trim() || alertName(input.criteria)).slice(0, 60),
    criteria: input.criteria,
    active: true,
    channels: input.channels,
    region,
    known_ids: matches.map((p) => p.id).slice(0, MAX_KNOWN),
    last_checked: new Date().toISOString(),
    last_sent: null,
    last_count: matches.length,
  });
  return { ok: true, alert, matches: matches.length };
}

/** Réactiver une alerte compte dans la limite du plan. */
export async function setAlertActive(profile: Pick<Profile, 'id' | 'plan'>, id: string, active: boolean, repo: Repo = getRepo()) {
  const alert = await repo.getRecord<AlertData>(profile.id, id);
  if (!alert || alert.kind !== ALERT_KIND) return { ok: false as const, error: 'criteres' as AlertError };
  if (active && !alert.data.active) {
    const limit = getPlan(profile.plan).alerts;
    const count = (await repo.listRecords<AlertData>(profile.id, ALERT_KIND)).filter((a) => a.data.active).length;
    if (!limit) return { ok: false as const, error: 'plan' as AlertError };
    if (count >= limit) return { ok: false as const, error: 'limite' as AlertError };
  }
  await repo.saveRecord(profile.id, ALERT_KIND, { ...alert.data, active }, alert.id);
  return { ok: true as const };
}

export interface AlertCheckSummary {
  alertes: number;
  notifiees: number;
  produits: number;
  ignorees: number;
}

/**
 * Tâche de nuit (à brancher après le relevé, avant ou après les récaps) : vérifie toutes les alertes actives. Une
 * notification par alerte et par jour au plus (clé d'idempotence), seulement pour des produits qui ne remplissaient pas
 * la règle avant. Renvoie un résumé pour l'historique des tâches.
 */
export async function checkAlerts(date: string, repo: Repo = getRepo(), now: Date = new Date()): Promise<AlertCheckSummary> {
  const summary: AlertCheckSummary = { alertes: 0, notifiees: 0, produits: 0, ignorees: 0 };
  const all = await repo.listAllRecords<AlertData>(ALERT_KIND);
  const byUser = new Map<string, AlertRecord[]>();
  for (const alert of all) byUser.set(alert.user_id, [...(byUser.get(alert.user_id) ?? []), alert]);
  const catalogs = new Map<RegionId, { products: Product[]; demo: boolean }>();

  for (const [userId, alerts] of byUser) {
    const profile = await repo.getProfile(userId);
    if (!profile) continue;
    const kept = new Set(activeAlertsWithinPlan(alerts, profile.plan).map((a) => a.id));
    summary.ignorees += alerts.filter((a) => a.data.active && !kept.has(a.id)).length;
    const region = regionFor(profile);
    if (!catalogs.has(region)) {
      const catalog = await getLiveCatalog(repo, now, region);
      // Pas de relevé du jour (tâche en échec, données anciennes) : aucune alerte, rien n'a changé.
      catalogs.set(region, { products: catalog.dataDate === date && !catalog.stale ? catalog.products : [], demo: catalog.demo });
    }
    const { products, demo } = catalogs.get(region)!;
    if (!products.length) continue;
    for (const alert of alerts.filter((a) => kept.has(a.id))) {
      summary.alertes++;
      const matches = matchingProducts(products, alert.data.criteria);
      const known = new Set(alert.data.known_ids);
      const fresh = matches.filter((p) => !known.has(p.id)).sort((a, b) => b.latest_score - a.latest_score);
      let sent = alert.data.last_sent;
      let notified = false;
      if (fresh.length) {
        const names = fresh.slice(0, 3).map((p) => `« ${p.name.slice(0, 60)} »`);
        const more = fresh.length > 3 ? ` et ${fresh.length - 3} autre${fresh.length - 3 > 1 ? 's' : ''}` : '';
        const path = fresh.length === 1 ? `/app/produit/${encodeURIComponent(fresh[0].id)}` : `/app/radar?${filtersToParams(alert.data.criteria).toString()}`;
        const result = await notify(
          userId,
          {
            type: 'alerte',
            title: `Alerte « ${alert.data.name} » : ${fresh.length} nouveau${fresh.length > 1 ? 'x' : ''} produit${fresh.length > 1 ? 's' : ''}`,
            body: `${names.join(', ')}${more} ${fresh.length > 1 ? 'remplissent' : 'remplit'} ta règle : ${alertSummary(alert.data.criteria)}.${
              demo ? ' (Produits fictifs : démonstration, en attendant les vraies données.)' : ''
            }`,
            path,
            action: fresh.length === 1 ? 'Voir le produit' : 'Voir dans le radar',
            channels: alert.data.channels,
            dedupeKey: `alerte:${alert.id}:${date}`,
          },
          repo,
        );
        if (result) {
          notified = true;
          summary.notifiees++;
          summary.produits += fresh.length;
          sent = now.toISOString();
        }
      }
      // Un produit n'est « connu » qu'une fois annoncé : si la notification du jour est déjà partie (ou a échoué),
      // les nouveaux produits restent à annoncer au relevé suivant.
      const freshIds = new Set(fresh.map((p) => p.id));
      const nowKnown = matches.filter((p) => notified || !freshIds.has(p.id)).map((p) => p.id);
      await repo.saveRecord<AlertData>(
        userId,
        ALERT_KIND,
        {
          ...alert.data,
          known_ids: [...new Set([...nowKnown, ...alert.data.known_ids])].slice(0, MAX_KNOWN),
          last_checked: now.toISOString(),
          last_sent: sent,
          last_count: matches.length,
        },
        alert.id,
      );
    }
  }
  return summary;
}
