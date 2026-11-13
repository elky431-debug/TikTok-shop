import type { CronRun, Profile, Subscription } from '@/lib/db/types';
import { env } from '@/lib/env';
import { REFERRAL_COMMISSION_RATE } from '@/lib/plans';
import { parisDate } from '@/lib/utils';
import type { DailyMetrics, Mrr } from './metrics';
import { monthlyCents, PAYING_STATUSES } from './metrics';
import { adminSettings } from './settings';

/**
 * Coûts estimés, chaque chiffre avec son hypothèse.
 *
 * Nexscope : les compteurs de la tâche nocturne (cron_runs.details : `stats.calls`, `videos`, `details`) donnent le
 * nombre d'appels par route ; les crédits par appel viennent de la doc et des deux vrais appels du 12 novembre 2026 :
 *   - recherche de produits (tiktok-product-discovery) : 22 crédits (exemple de réponse de la doc, `costToken`) ;
 *   - vidéos d'un produit (et/listProductVideo) : 11 crédits (doc ; mesuré 11,6) ;
 *   - ventes par période (et/batchProductDetail, lots de 20) : 96 crédits par lot (mesuré pour 10 produits ; un lot de
 *     20 peut coûter davantage).
 * Les appels faits à la demande (bouton « Charger les vidéos », analyses de vidéo) ne passent pas par la tâche nocturne
 * et ne sont pas comptés ici.
 *
 * IA : les jetons ne sont pas enregistrés par appel ; estimation = nombre de générations × jetons mesurés :
 *   - script du studio : 1 300 jetons en entrée et 3 800 en sortie (raisonnement compris), mesurés avec gpt-6-luna ;
 *   - autre appel (proposition, analyse, accroche Discord) : 1 500 en entrée et 2 000 en sortie (hypothèse) ;
 *   - prix par million de jetons (doc OpenAI lue le 12 novembre 2026, décision 115) ; autre modèle : AI_PRICE_* ou inconnu.
 */
export const NEXSCOPE_CREDITS = { discovery: 22, video: 11, detailBatch: 96 } as const;
export const DETAIL_BATCH_SIZE = 20;
export const TOKENS = { script: { input: 1300, output: 3800 }, other: { input: 1500, output: 2000 } } as const;
/** Prix connus, en dollars par million de jetons (entrée, sortie). */
export const AI_PRICES: Record<string, { input: number; output: number }> = {
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-5.5': { input: 5, output: 30 },
};

export interface NexscopeDay {
  day: string;
  calls: number;
  discovery: number;
  videos: number;
  detailBatches: number;
  credits: number;
  /** null = prix du crédit inconnu (NEXSCOPE_EUR_PER_1000_CREDITS). */
  eur: number | null;
  cacheHits: number;
}

/** Crédits d'une exécution de la tâche nocturne, d'après ses compteurs (null si la source n'était pas Nexscope). */
export function nexscopeRunCost(run: Pick<CronRun, 'details' | 'started_at'>): Omit<NexscopeDay, 'day' | 'eur'> | null {
  const d = run.details as { provider?: string; stats?: { calls?: number; cacheHits?: number }; videos?: number; details?: number };
  if (d.provider !== 'nexscope' || !d.stats) return null;
  const calls = Number(d.stats.calls) || 0;
  const videos = Number(d.videos) || 0;
  const detailBatches = Math.ceil((Number(d.details) || 0) / DETAIL_BATCH_SIZE);
  const discovery = Math.max(0, calls - videos - detailBatches);
  return {
    calls,
    discovery,
    videos,
    detailBatches,
    credits: discovery * NEXSCOPE_CREDITS.discovery + videos * NEXSCOPE_CREDITS.video + detailBatches * NEXSCOPE_CREDITS.detailBatch,
    cacheHits: Number(d.stats.cacheHits) || 0,
  };
}

export function nexscopeByDay(runs: CronRun[], eurPer1000 = adminSettings.nexscopeEurPer1000Credits): NexscopeDay[] {
  const days = new Map<string, NexscopeDay>();
  for (const run of runs) {
    if (run.job !== 'refresh') continue;
    const cost = nexscopeRunCost(run);
    if (!cost) continue;
    const day = parisDate(new Date(run.started_at));
    const current = days.get(day) ?? { day, calls: 0, discovery: 0, videos: 0, detailBatches: 0, credits: 0, eur: null, cacheHits: 0 };
    current.calls += cost.calls;
    current.discovery += cost.discovery;
    current.videos += cost.videos;
    current.detailBatches += cost.detailBatches;
    current.credits += cost.credits;
    current.cacheHits += cost.cacheHits;
    current.eur = eurPer1000 === null ? null : (current.credits * eurPer1000) / 1000;
    days.set(day, current);
  }
  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/** Prix du modèle d'IA configuré ; null si inconnu ou si l'IA n'est pas branchée (scripts simulés : 0 $). */
export function aiPrice(): { model: string; input: number; output: number } | null {
  if (!env.aiProvider) return { model: 'simulé', input: 0, output: 0 };
  const model = env.aiProvider === 'openai' ? env.openaiModel : env.anthropicModel;
  const known = AI_PRICES[model] ?? adminSettings.aiPriceOverride;
  return known ? { model, ...known } : null;
}

export function aiCostUsd(metrics: Pick<DailyMetrics, 'scripts' | 'otherAi'>, price = aiPrice()): number | null {
  if (!price) return null;
  const perCall = (t: { input: number; output: number }) => (t.input * price.input + t.output * price.output) / 1_000_000;
  return metrics.scripts * perCall(TOKENS.script) + metrics.otherAi * perCall(TOKENS.other);
}

export interface Margin {
  revenueHtCents: number;
  commissionsCents: number;
  stripeFeesCents: number;
  nexscopeCents: number | null;
  aiCents: number | null;
  fixedCents: number;
  marginCents: number;
  perPayingCents: number | null;
  paying: number;
  /** Ce qui manque pour un calcul complet. */
  missing: string[];
}

/**
 * Marge mensuelle estimée = MRR hors taxes − commissions (30 % HT, ou le taux du formateur, pour les abonnés venus
 * par un lien) − frais Stripe − coûts variables des 30 derniers jours (Nexscope, IA) − coûts fixes.
 */
export function estimateMargin(input: {
  mrr: Mrr;
  subscriptions: Subscription[];
  profiles: Array<Pick<Profile, 'id' | 'coach_id' | 'referred_by'>>;
  coachRates: Map<string, number>;
  nexscope30: NexscopeDay[];
  ai30: Array<Pick<DailyMetrics, 'scripts' | 'otherAi'>>;
}): Margin {
  const vat = 1 + adminSettings.vatRate;
  const byId = new Map(input.profiles.map((p) => [p.id, p]));
  let commissionsCents = 0;
  let stripeFeesCents = 0;
  for (const s of input.subscriptions) {
    if (!PAYING_STATUSES.includes(s.status)) continue;
    const ttc = monthlyCents(s);
    const profile = byId.get(s.user_id);
    if (profile?.coach_id || profile?.referred_by) {
      const rate = (profile.coach_id && input.coachRates.get(profile.coach_id)) || REFERRAL_COMMISSION_RATE;
      commissionsCents += Math.round((ttc / vat) * rate);
    }
    // Un paiement par mois (mensuel) ou par an (annuel, frais ramenés au mois).
    const paymentTtc = s.billing_interval === 'year' ? ttc * 12 : ttc;
    const fee = (paymentTtc * adminSettings.stripeFeePercent) / 100 + adminSettings.stripeFeeFixedCents;
    stripeFeesCents += Math.round(s.billing_interval === 'year' ? fee / 12 : fee);
  }
  const missing: string[] = [];
  const credits = input.nexscope30.reduce((s, d) => s + d.credits, 0);
  const eurPer1000 = adminSettings.nexscopeEurPer1000Credits;
  const nexscopeCents = eurPer1000 === null ? (credits > 0 ? null : 0) : Math.round((credits * eurPer1000) / 10);
  if (nexscopeCents === null) missing.push('prix du crédit Nexscope (NEXSCOPE_EUR_PER_1000_CREDITS)');
  const usd = input.ai30.reduce<number | null>((s, d) => {
    const c = aiCostUsd(d);
    return s === null || c === null ? null : s + c;
  }, 0);
  const aiCents = usd === null ? null : Math.round(usd * adminSettings.usdToEur * 100);
  if (aiCents === null) missing.push('prix du modèle d’IA (AI_PRICE_INPUT_PER_MTOK, AI_PRICE_OUTPUT_PER_MTOK)');
  const fixedCents = Math.round(adminSettings.fixedCostsEurPerMonth * 100);
  if (fixedCents === 0) missing.push('coûts fixes (ADMIN_FIXED_COSTS_EUR_MONTH)');
  const marginCents = input.mrr.htCents - commissionsCents - stripeFeesCents - (nexscopeCents ?? 0) - (aiCents ?? 0) - fixedCents;
  return {
    revenueHtCents: input.mrr.htCents,
    commissionsCents,
    stripeFeesCents,
    nexscopeCents,
    aiCents,
    fixedCents,
    marginCents,
    perPayingCents: input.mrr.paying > 0 ? Math.round(marginCents / input.mrr.paying) : null,
    paying: input.mrr.paying,
    missing,
  };
}
