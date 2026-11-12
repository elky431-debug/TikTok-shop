import type { BillingInterval, PlanId } from '@/lib/db/types';

export interface PlanLimits {
  id: PlanId;
  name: string;
  /** Produits du jour visibles en clair (Infinity = tous). */
  visibleProducts: number;
  showScore: boolean;
  /** Scripts par jour (Infinity = illimité). */
  scriptsPerDay: number;
  emailDigest: boolean;
  discordDigest: boolean;
  filters: boolean;
  export: boolean;
  priorityFeatures: boolean;
  /** Suivi des gains (saisie, import CSV, tableau de bord). */
  earnings: boolean;
  /** Plan de publication de 20 vidéos, rappels, export .ics. */
  planning: boolean;
  /** Tri des propositions de marques par l'IA : nombre par jour (0 = fermé). */
  offersPerDay: number;
  /** Analyses de vidéos virales par jour (0 = fermé). */
  analysesPerDay: number;
  /** Catalogues allemand, italien et espagnol. */
  europe: boolean;
  prices: Record<BillingInterval, number>; // centimes TTC
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: 'free',
    name: 'Gratuit',
    visibleProducts: 3,
    showScore: false,
    scriptsPerDay: 3,
    emailDigest: true,
    discordDigest: false,
    filters: true,
    export: false,
    priorityFeatures: false,
    earnings: false,
    planning: false,
    offersPerDay: 0,
    analysesPerDay: 0,
    europe: false,
    prices: { month: 0, year: 0 },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    visibleProducts: Number.POSITIVE_INFINITY,
    showScore: true,
    scriptsPerDay: 30,
    emailDigest: true,
    discordDigest: true,
    filters: true,
    export: false,
    priorityFeatures: false,
    earnings: true,
    planning: true,
    offersPerDay: 0,
    analysesPerDay: 0,
    europe: false,
    prices: { month: 1990, year: 16700 },
  },
  proplus: {
    id: 'proplus',
    name: 'Pro+',
    visibleProducts: Number.POSITIVE_INFINITY,
    showScore: true,
    scriptsPerDay: Number.POSITIVE_INFINITY,
    emailDigest: true,
    discordDigest: true,
    filters: true,
    export: true,
    priorityFeatures: true,
    earnings: true,
    planning: true,
    offersPerDay: 20,
    analysesPerDay: 20,
    europe: true,
    prices: { month: 3990, year: 33500 },
  },
};

export const PAID_PLANS: PlanId[] = ['pro', 'proplus'];

export function getPlan(plan: PlanId | null | undefined): PlanLimits {
  return PLANS[plan ?? 'free'] ?? PLANS.free;
}

export function isPaidPlan(plan: PlanId | null | undefined): boolean {
  return plan === 'pro' || plan === 'proplus';
}

export function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'pro' || value === 'proplus';
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'month' || value === 'year';
}

/** Limite au format attendu par incrementUsage : -1 = illimité. */
export function scriptLimitForUsage(plan: PlanId): number {
  const limit = getPlan(plan).scriptsPerDay;
  return Number.isFinite(limit) ? limit : -1;
}

/** Scripts restants aujourd'hui (Infinity si illimité). */
export function remainingScripts(plan: PlanId, usedToday: number): number {
  const limit = getPlan(plan).scriptsPerDay;
  if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;
  return Math.max(0, limit - usedToday);
}

/** Économie de l'abonnement annuel par rapport à 12 mois, en centimes. */
export function yearlySavings(plan: PlanId): number {
  const p = getPlan(plan);
  return p.prices.month * 12 - p.prices.year;
}

/** Équivalent mensuel de l'annuel, en centimes arrondis. */
export function yearlyMonthlyEquivalent(plan: PlanId): number {
  return Math.round(getPlan(plan).prices.year / 12);
}

/** Durée de l'essai offert aux élèves arrivant avec un code formateur. */
export const COACH_TRIAL_DAYS = 90;
/** Commission récurrente des parrains et formateurs. */
export const REFERRAL_COMMISSION_RATE = 0.3;
/** Objectif de vidéos par produit suivi. */
export const DEFAULT_VIDEO_GOAL = 20;
/** Régénérations d'accroche permises par script. */
export const MAX_HOOK_REGENERATIONS = 5;
