import { getRepo, type Repo } from '@/lib/db';
import type { PlanId, Profile, Subscription } from '@/lib/db/types';
import { mapWithConcurrency } from '@/lib/jobs/concurrency';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { addDays, parisDate, parisTimeToUtc } from '@/lib/utils';
import { adminSettings } from './settings';

/**
 * Indicateurs de l'admin, calculés depuis la base (jamais inventés) :
 * - MRR : abonnements payants actifs (statuts « active » et « past_due » : Stripe réessaie encore) × prix du plan,
 *   l'annuel ramené au mois (prix annuel ÷ 12). Les essais (« trialing ») ne paient pas encore : comptés à part.
 * - Conversion gratuit → payant : comptes payants ÷ comptes inscrits (onboarding terminé).
 * - Résiliations : abonnements passés à « canceled » ou « unpaid » sur 30 jours, plus les résiliations programmées.
 * - Actifs par jour : relevé chaque nuit (`recordDailyMetrics`), gardé dans le cache serveur 400 jours.
 */
export const PAYING_STATUSES = ['active', 'past_due'];
export const ENDED_STATUSES = ['canceled', 'unpaid', 'incomplete_expired'];

/** Dernier état de l'abonnement de chaque utilisateur (Stripe en priorité ; simulé seulement s'il n'y a rien d'autre). */
export function latestSubscriptions(all: Subscription[]): { subscriptions: Subscription[]; source: 'stripe' | 'simulation' | 'aucun' } {
  const stripe = all.filter((s) => s.provider === 'stripe');
  const pool = stripe.length ? stripe : all.filter((s) => s.provider === 'simulation');
  const byUser = new Map<string, Subscription>();
  for (const s of pool) {
    const current = byUser.get(s.user_id);
    const rank = (x: Subscription) => (PAYING_STATUSES.includes(x.status) || x.status === 'trialing' ? 1 : 0);
    if (!current || rank(s) > rank(current) || (rank(s) === rank(current) && s.updated_at > current.updated_at)) byUser.set(s.user_id, s);
  }
  return { subscriptions: [...byUser.values()], source: stripe.length ? 'stripe' : pool.length ? 'simulation' : 'aucun' };
}

/** Montant mensuel TTC d'un abonnement (annuel ÷ 12), en centimes. */
export function monthlyCents(sub: Pick<Subscription, 'plan' | 'billing_interval'>): number {
  const plan = getPlan(sub.plan);
  return sub.billing_interval === 'year' ? Math.round(plan.prices.year / 12) : plan.prices.month;
}

export interface Mrr {
  ttcCents: number;
  htCents: number;
  paying: number;
  trialing: number;
  byPlan: Record<'pro' | 'proplus', { month: number; year: number; cents: number }>;
}

export function computeMrr(subscriptions: Subscription[], vatRate = adminSettings.vatRate): Mrr {
  const byPlan: Mrr['byPlan'] = { pro: { month: 0, year: 0, cents: 0 }, proplus: { month: 0, year: 0, cents: 0 } };
  let ttcCents = 0;
  let paying = 0;
  for (const s of subscriptions) {
    if (!PAYING_STATUSES.includes(s.status) || !isPaidPlan(s.plan)) continue;
    const cents = monthlyCents(s);
    const bucket = byPlan[s.plan as 'pro' | 'proplus'];
    bucket[s.billing_interval === 'year' ? 'year' : 'month']++;
    bucket.cents += cents;
    ttcCents += cents;
    paying++;
  }
  return {
    ttcCents,
    htCents: Math.round(ttcCents / (1 + vatRate)),
    paying,
    trialing: subscriptions.filter((s) => s.status === 'trialing').length,
    byPlan,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Relevé quotidien (actifs, scripts, appels d'IA), écrit la nuit par `recordDailyMetrics` pour la veille.
// ---------------------------------------------------------------------------------------------------------------------
export interface DailyMetrics {
  day: string;
  /** Utilisateurs venus ce jour-là (dernière visite ce jour, ou un script écrit ce jour). */
  active: number;
  signups: number;
  /** Scripts écrits (compteur du quota du studio). */
  scripts: number;
  /** Autres appels à l'IA : propositions de marques, analyses, /script sur Discord. */
  otherAi: number;
  recorded_at: string;
}

/** Types de fiches dont chaque création appelle l'IA une fois (à compléter quand une fonction d'IA s'ajoute). */
export const AI_RECORD_KINDS = ['offre', 'analyse'] as const;

const metricsKey = (day: string) => `admin:jour:${day}`;
const inDay = (iso: string | null, day: string) => Boolean(iso) && parisDate(new Date(iso!)) === day;

export async function computeDailyMetrics(day: string, repo: Repo, now = new Date()): Promise<DailyMetrics> {
  const start = parisTimeToUtc(day, 0).toISOString();
  const profiles = await repo.listProfiles({ limit: 1000 });
  // Seuls les comptes vus depuis ce jour-là ont pu écrire un script ce jour-là.
  const candidates = profiles.filter((p) => p.last_seen_at && p.last_seen_at >= start);
  const usage = await mapWithConcurrency(candidates, 8, (p) => repo.getUsage(p.id, day));
  const active = new Set<string>(candidates.filter((p, i) => inDay(p.last_seen_at, day) || usage[i] > 0).map((p) => p.id));
  const records = await Promise.all([...AI_RECORD_KINDS, 'commande_discord'].map((kind) => repo.listAllRecords<{ ia?: boolean }>(kind)));
  const otherAi = records
    .flat()
    .filter((r) => inDay(r.created_at, day) && (r.kind !== 'commande_discord' || r.data?.ia === true)).length;
  return {
    day,
    active: active.size,
    signups: profiles.filter((p: Profile) => inDay(p.created_at, day)).length,
    scripts: usage.reduce((s, n) => s + n, 0),
    otherAi,
    recorded_at: now.toISOString(),
  };
}

/** À brancher dans la tâche nocturne : relève la veille (une fois). */
export async function recordDailyMetrics(repo: Repo = getRepo(), now = new Date()): Promise<DailyMetrics> {
  const day = addDays(parisDate(now), -1);
  const existing = (await repo.getProviderCache(metricsKey(day))) as DailyMetrics | null;
  if (existing) return existing;
  const metrics = await computeDailyMetrics(day, repo, now);
  await repo.setProviderCache(metricsKey(day), metrics, new Date(now.getTime() + 400 * 86_400_000).toISOString());
  return metrics;
}

/** Les N derniers jours relevés (les jours sans relevé sont absents, jamais inventés). */
export async function listDailyMetrics(days: number, repo: Repo = getRepo(), now = new Date()): Promise<DailyMetrics[]> {
  const today = parisDate(now);
  const keys = Array.from({ length: days }, (_, i) => addDays(today, -(days - i)));
  const found = await Promise.all(keys.map((day) => repo.getProviderCache(metricsKey(day)).catch(() => null)));
  return found.filter((m): m is DailyMetrics => Boolean(m && typeof m === 'object' && 'day' in (m as object)));
}

export interface BusinessMetrics {
  source: 'stripe' | 'simulation' | 'aucun';
  mrr: Mrr;
  accounts: number;
  onboarded: number;
  signups: { today: number; last7: number; last30: number; byDay: Array<{ day: string; count: number }> };
  conversion: { paying: number; onboarded: number; rate: number | null; cohort30: { signups: number; paying: number; rate: number | null } };
  churn: { ended30: number; scheduled: number; rate: number | null };
  active: { today: number; last7: number; last30: number };
  plans: Record<PlanId, number>;
}

export async function getBusinessMetrics(repo: Repo = getRepo(), now = new Date()): Promise<BusinessMetrics> {
  const [profiles, allSubs] = await Promise.all([repo.listProfiles({ limit: 1000 }), repo.listSubscriptions()]);
  const { subscriptions, source } = latestSubscriptions(allSubs);
  const mrr = computeMrr(subscriptions);
  const today = parisDate(now);
  const since = (days: number) => parisTimeToUtc(addDays(today, -days + 1), 0).toISOString();
  const onboarded = profiles.filter((p) => p.onboarded_at);
  const payingUsers = new Set(subscriptions.filter((s) => PAYING_STATUSES.includes(s.status) && isPaidPlan(s.plan)).map((s) => s.user_id));
  const recent = onboarded.filter((p) => p.created_at >= since(30));
  const ended30 = subscriptions.filter((s) => ENDED_STATUSES.includes(s.status) && s.updated_at >= since(30)).length;
  const plans: Record<PlanId, number> = { free: 0, pro: 0, proplus: 0 };
  for (const p of profiles) plans[p.plan]++;
  const rate = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    source,
    mrr,
    accounts: profiles.length,
    onboarded: onboarded.length,
    signups: {
      today: profiles.filter((p) => p.created_at >= since(1)).length,
      last7: profiles.filter((p) => p.created_at >= since(7)).length,
      last30: profiles.filter((p) => p.created_at >= since(30)).length,
      byDay: Array.from({ length: 14 }, (_, i) => {
        const day = addDays(today, i - 13);
        return { day, count: profiles.filter((p) => inDay(p.created_at, day)).length };
      }),
    },
    conversion: {
      paying: payingUsers.size,
      onboarded: onboarded.length,
      rate: rate(onboarded.filter((p) => payingUsers.has(p.id)).length, onboarded.length),
      cohort30: { signups: recent.length, paying: recent.filter((p) => payingUsers.has(p.id)).length, rate: rate(recent.filter((p) => payingUsers.has(p.id)).length, recent.length) },
    },
    churn: {
      ended30,
      scheduled: subscriptions.filter((s) => PAYING_STATUSES.includes(s.status) && s.cancel_at_period_end).length,
      rate: rate(ended30, mrr.paying + ended30),
    },
    active: {
      today: profiles.filter((p) => p.last_seen_at && p.last_seen_at >= since(1)).length,
      last7: profiles.filter((p) => p.last_seen_at && p.last_seen_at >= since(7)).length,
      last30: profiles.filter((p) => p.last_seen_at && p.last_seen_at >= since(30)).length,
    },
    plans,
  };
}
