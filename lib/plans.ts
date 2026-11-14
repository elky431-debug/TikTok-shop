import type { BillingInterval, PlanId } from '@/lib/db/types';

/**
 * Grille de prix (13 novembre 2026) : tout est payant, sans plan gratuit ni essai. Un compte sans abonnement (`aucun`)
 * n'entre pas dans l'appli : il choisit d'abord Starter, Pro (recommandé) ou Elite. Toutes ces limites sont appliquées
 * côté serveur.
 *
 * « Illimité » n'existe pas côté serveur : chaque quota « illimité » garde un plafond de sécurité (coûts Nexscope et
 * OpenAI), jamais affiché. Les clés concernées sont listées dans `unlimited` : l'interface affiche « Illimité » et ne
 * montre ni le plafond ni ce qu'il en reste.
 */
export interface PlanLimits {
  id: PlanId;
  name: string;
  /** Donne accès à l'appli (faux pour un compte sans abonnement). */
  access: boolean;
  /** Produits du jour visibles en clair (Infinity = tous). */
  visibleProducts: number;
  showScore: boolean;
  filters: boolean;
  /** Générations de scripts (10 accroches + 3 scripts) par jour. */
  scriptsPerDay: number;
  /** Formats de vidéo ouverts : les N premiers de `SCRIPT_FORMATS` (5 ou 8). */
  scriptFormats: number;
  teleprompter: boolean;
  /** Produits suivis (« Mes produits »). */
  savedProducts: number;
  /** Plan de publication de 20 vidéos, rappels, export .ics. */
  planning: boolean;
  /** Récap du matin, par e-mail et sur Discord. */
  emailDigest: boolean;
  discordDigest: boolean;
  /** Récap de la semaine. */
  weeklyDigest: boolean;
  /** Alertes personnalisées actives. */
  alerts: number;
  /** Recherches par mot-clé chez Nexscope, par jour. */
  keywordSearchesPerDay: number;
  /** Mode préparation (sous 1 500 abonnés). */
  preparation: boolean;
  /** Parrainage (lien, commission). */
  referral: boolean;
  /** Style personnel tiré de ses vidéos. */
  personalStyle: boolean;
  /** Analyses de style par jour. */
  styleAnalysesPerDay: number;
  /** Séries de 20 vidéos (20 angles) par jour. */
  anglesSeriesPerDay: number;
  /** Score « pour toi » (personnalisé selon ton profil). */
  personalScore: boolean;
  /** Suivi des gains (saisie, import CSV, tableau de bord). */
  earnings: boolean;
  /** Analyses de vidéo par mois (0 = fermé). */
  analysesPerMonth: number;
  /** Propositions de marques triées par l'IA, par mois (0 = fermé). */
  offersPerMonth: number;
  /** Comparateur de produits (2 à 4). */
  compare: boolean;
  /** Analyse IA des accroches des vidéos d'un produit, par jour. */
  hookAnalysesPerDay: number;
  /** Retouches IA (ligne, raccourcir, plus percutant, traduction) par génération. */
  editsPerGeneration: number;
  /** Commandes Discord /score et /script, par jour (identique à l'appli). */
  discordCommandsPerDay: number;
  /** Catalogues allemand, italien et espagnol. */
  europe: boolean;
  /** Traduction des scripts pour les marchés européens. */
  scriptTranslation: boolean;
  /** Poids du score réglables. */
  customWeights: boolean;
  /** Export CSV du radar filtré. */
  radarExport: boolean;
  /** Export des scripts (PDF, texte, tout l'historique). */
  export: boolean;
  /** Quotas affichés « Illimité » (plafond de sécurité invisible côté serveur). */
  unlimited: readonly UnlimitedKey[];
  prices: Record<BillingInterval, number>; // centimes TTC
}

export type UnlimitedKey =
  | 'scriptsPerDay'
  | 'savedProducts'
  | 'alerts'
  | 'styleAnalysesPerDay'
  | 'anglesSeriesPerDay'
  | 'analysesPerMonth'
  | 'offersPerMonth'
  | 'hookAnalysesPerDay'
  | 'editsPerGeneration'
  | 'discordCommandsPerDay';

/** Plafonds de sécurité des quotas « illimités » (jamais affichés). */
export const SAFETY_CAPS = {
  scriptsPerDay: 150,
  savedProducts: 500,
  alerts: 50,
  styleAnalysesPerDay: 20,
  anglesSeriesPerDay: 20,
  analysesPerMonth: 300,
  offersPerMonth: 300,
  hookAnalysesPerDay: 50,
  editsPerGeneration: 60,
  discordCommandsPerDay: 150,
} as const satisfies Record<UnlimitedKey, number>;

const NONE: PlanLimits = {
  id: 'aucun',
  name: 'Sans abonnement',
  access: false,
  visibleProducts: 0,
  showScore: false,
  filters: false,
  scriptsPerDay: 0,
  scriptFormats: 0,
  teleprompter: false,
  savedProducts: 0,
  planning: false,
  emailDigest: false,
  discordDigest: false,
  weeklyDigest: false,
  alerts: 0,
  keywordSearchesPerDay: 0,
  preparation: false,
  referral: false,
  personalStyle: false,
  styleAnalysesPerDay: 0,
  anglesSeriesPerDay: 0,
  personalScore: false,
  earnings: false,
  analysesPerMonth: 0,
  offersPerMonth: 0,
  compare: false,
  hookAnalysesPerDay: 0,
  editsPerGeneration: 0,
  discordCommandsPerDay: 0,
  europe: false,
  scriptTranslation: false,
  customWeights: false,
  radarExport: false,
  export: false,
  unlimited: [],
  prices: { month: 0, year: 0 },
};

const STARTER: PlanLimits = {
  ...NONE,
  id: 'starter',
  name: 'Starter',
  access: true,
  visibleProducts: Number.POSITIVE_INFINITY,
  showScore: true,
  filters: true,
  scriptsPerDay: 10,
  scriptFormats: 5,
  teleprompter: true,
  savedProducts: 10,
  planning: true,
  emailDigest: true,
  discordDigest: true,
  alerts: 3,
  keywordSearchesPerDay: 3,
  preparation: true,
  referral: true,
  editsPerGeneration: 10,
  discordCommandsPerDay: 10,
  prices: { month: 3499, year: 27990 },
};

const PRO: PlanLimits = {
  ...STARTER,
  id: 'pro',
  name: 'Pro',
  scriptsPerDay: 40,
  scriptFormats: 8,
  savedProducts: SAFETY_CAPS.savedProducts,
  weeklyDigest: true,
  alerts: 15,
  keywordSearchesPerDay: 15,
  personalStyle: true,
  styleAnalysesPerDay: 5,
  anglesSeriesPerDay: 3,
  personalScore: true,
  earnings: true,
  analysesPerMonth: 20,
  offersPerMonth: 20,
  compare: true,
  hookAnalysesPerDay: 10,
  editsPerGeneration: 20,
  discordCommandsPerDay: 40,
  unlimited: ['savedProducts'],
  prices: { month: 5999, year: 47990 },
};

const ELITE: PlanLimits = {
  ...PRO,
  id: 'elite',
  name: 'Elite',
  scriptsPerDay: SAFETY_CAPS.scriptsPerDay,
  alerts: SAFETY_CAPS.alerts,
  keywordSearchesPerDay: 50,
  styleAnalysesPerDay: SAFETY_CAPS.styleAnalysesPerDay,
  anglesSeriesPerDay: SAFETY_CAPS.anglesSeriesPerDay,
  analysesPerMonth: SAFETY_CAPS.analysesPerMonth,
  offersPerMonth: SAFETY_CAPS.offersPerMonth,
  hookAnalysesPerDay: SAFETY_CAPS.hookAnalysesPerDay,
  editsPerGeneration: SAFETY_CAPS.editsPerGeneration,
  discordCommandsPerDay: SAFETY_CAPS.discordCommandsPerDay,
  europe: true,
  scriptTranslation: true,
  customWeights: true,
  radarExport: true,
  export: true,
  unlimited: [
    'scriptsPerDay',
    'savedProducts',
    'alerts',
    'styleAnalysesPerDay',
    'anglesSeriesPerDay',
    'analysesPerMonth',
    'offersPerMonth',
    'hookAnalysesPerDay',
    'editsPerGeneration',
    'discordCommandsPerDay',
  ],
  prices: { month: 9799, year: 77990 },
};

export const PLANS: Record<PlanId, PlanLimits> = { aucun: NONE, starter: STARTER, pro: PRO, elite: ELITE };

/** Plans payants, du moins cher au plus cher. */
export const PAID_PLANS = ['starter', 'pro', 'elite'] as const satisfies readonly PlanId[];
export type PaidPlanId = (typeof PAID_PLANS)[number];
/** Plan mis en avant (« Recommandé »). */
export const RECOMMENDED_PLAN: PaidPlanId = 'pro';

export function getPlan(plan: PlanId | null | undefined): PlanLimits {
  // Valeurs de l'ancienne grille, tant que la migration `nouvelle_grille` n'est pas passée sur la base.
  if ((plan as string) === 'proplus') return ELITE;
  return (plan && PLANS[plan]) || NONE;
}

export function isPaidPlan(plan: PlanId | null | undefined): plan is PaidPlanId {
  return plan === 'starter' || plan === 'pro' || plan === 'elite';
}

/** Plan payant lu dans un formulaire ou une adresse (`proplus` de l'ancienne grille = `elite`), sinon null. */
export function parsePaidPlan(value: unknown): PaidPlanId | null {
  if (value === 'proplus') return 'elite';
  return value === 'starter' || value === 'pro' || value === 'elite' ? value : null;
}

export function isPlanId(value: unknown): value is PlanId {
  return value === 'aucun' || isPaidPlan(value as PlanId);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'month' || value === 'year';
}

/** Rang du plan (0 = sans abonnement), pour comparer deux plans. */
export function planRank(plan: PlanId | null | undefined): number {
  return plan ? Math.max(0, (PAID_PLANS as readonly PlanId[]).indexOf(plan) + 1) : 0;
}

/** Quota affiché « Illimité » pour ce plan (le serveur applique un plafond de sécurité). */
export function isUnlimited(plan: PlanId | null | undefined, key: UnlimitedKey): boolean {
  return getPlan(plan).unlimited.includes(key);
}

/**
 * Ce qu'il reste d'un quota, en clair (« 12 analyses restantes ce mois-ci »), ou « illimité » sans le plafond de
 * sécurité : un quota « Illimité » ne montre jamais ni son plafond ni ce qu'il en reste.
 */
export function remainingLabel(
  plan: PlanId | null | undefined,
  key: UnlimitedKey,
  left: number,
  noun: { one: string; many: string; feminine?: boolean },
  period: 'aujourd’hui' | 'ce mois-ci',
): string {
  if (isUnlimited(plan, key)) return `${noun.many.charAt(0).toUpperCase()}${noun.many.slice(1)} ${noun.feminine ? 'illimitées' : 'illimités'}.`;
  const word = left > 1 ? noun.many : noun.one;
  const rest = noun.feminine ? (left > 1 ? 'restantes' : 'restante') : left > 1 ? 'restants' : 'restant';
  return `${left} ${word} ${rest} ${period}.`;
}

/** Quota épuisé : la limite du plan (et le plan qui va plus loin), ou la limite de sécurité d'un quota « illimité ». */
export function quotaReachedMessage(plan: PlanId | null | undefined, key: UnlimitedKey, what: string, period: 'du jour' | 'du mois'): string {
  const reset = period === 'du jour' ? 'Le compteur repart à minuit.' : 'Le compteur repart le 1er du mois.';
  if (isUnlimited(plan, key)) return `Limite de sécurité ${period} atteinte. ${reset}`;
  const current = getPlan(plan);
  const better = cheapestPlanWith((p) => p[key] > current[key]);
  const upgrade = better.id !== current.id && planRank(better.id) > planRank(current.id) ? ` ${better.name} va plus loin.` : '';
  return `Tu as utilisé tes ${what} ${period}.${upgrade} ${reset}`;
}

/** Le moins cher des plans qui offre une fonction : pour les messages « inclus dans Pro ». */
export function cheapestPlanWith(has: (plan: PlanLimits) => boolean): PlanLimits {
  return PAID_PLANS.map((id) => PLANS[id]).find(has) ?? ELITE;
}

/** Limite au format attendu par incrementUsage : -1 = illimité (jamais : les plafonds de sécurité s'appliquent). */
export function scriptLimitForUsage(plan: PlanId): number {
  const limit = getPlan(plan).scriptsPerDay;
  return Number.isFinite(limit) ? limit : -1;
}

/** Scripts restants aujourd'hui. */
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

/** Remise du code formateur : −20 % sur le premier mois (abonnement mensuel). */
export const COACH_FIRST_MONTH_DISCOUNT = 0.2;
/** Commission récurrente des parrains et formateurs. */
export const REFERRAL_COMMISSION_RATE = 0.3;
/** Objectif de vidéos par produit suivi. */
export const DEFAULT_VIDEO_GOAL = 20;
/** Régénérations d'accroche permises par script. */
export const MAX_HOOK_REGENERATIONS = 5;
