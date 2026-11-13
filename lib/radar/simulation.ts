/**
 * Simulation de commissions (fiche produit, bloc 3). Module pur. Ce n'est pas une prévision : les hypothèses sont
 * réglables, les valeurs de départ sont volontairement prudentes, et le résultat est une fourchette (la moitié à une
 * fois et demie du calcul central), jamais un chiffre unique. Aucune promesse de gains.
 *
 *   ventes = vidéos × vues par vidéo × taux de clic × taux de conversion
 *   commissions = ventes × commission par vente du produit (chiffre réel du jour)
 */
export interface SimulationInput {
  /** Vues moyennes par vidéo. */
  views: number;
  /** Part des personnes qui cliquent sur le produit, en pour cent. */
  clickRate: number;
  /** Part des clics qui achètent, en pour cent. */
  conversionRate: number;
  videos: number;
  /** Commission par vente du produit, en centimes. */
  commissionCents: number;
}

export const SIMULATION_DEFAULTS = { views: 500, clickRate: 1, conversionRate: 2, videos: 20 } as const;

export const SIMULATION_LIMITS = {
  views: { min: 0, max: 10_000_000 },
  clickRate: { min: 0, max: 100 },
  conversionRate: { min: 0, max: 100 },
  videos: { min: 1, max: 200 },
} as const;

/** Fourchette autour du calcul central : les vues varient beaucoup d'une vidéo à l'autre. */
export const SIMULATION_RANGE = { low: 0.5, high: 1.5 } as const;

export const SIMULATION_HINTS: Record<keyof typeof SIMULATION_DEFAULTS, string> = {
  views: 'Point de départ volontairement bas. Mets plutôt la moyenne de tes dernières vidéos.',
  clickRate: 'Sur 100 personnes qui voient la vidéo, combien cliquent sur le produit. Hypothèse prudente, pas une moyenne mesurée.',
  conversionRate: 'Sur 100 clics, combien achètent. Hypothèse prudente : remplace-la par tes statistiques d’affilié si tu les as.',
  videos: 'L’objectif conseillé sur un même produit.',
};

export interface SimulationResult {
  clicks: number;
  sales: { low: number; mid: number; high: number };
  commission_cents: { low: number; mid: number; high: number };
}

const bound = (value: number, { min, max }: { min: number; max: number }) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);

export function sanitizeSimulation(input: Partial<SimulationInput> & { commissionCents: number }): SimulationInput {
  return {
    views: Math.round(bound(input.views ?? SIMULATION_DEFAULTS.views, SIMULATION_LIMITS.views)),
    clickRate: bound(input.clickRate ?? SIMULATION_DEFAULTS.clickRate, SIMULATION_LIMITS.clickRate),
    conversionRate: bound(input.conversionRate ?? SIMULATION_DEFAULTS.conversionRate, SIMULATION_LIMITS.conversionRate),
    videos: Math.round(bound(input.videos ?? SIMULATION_DEFAULTS.videos, SIMULATION_LIMITS.videos)),
    commissionCents: Math.max(0, Math.round(input.commissionCents)),
  };
}

export function simulateEarnings(raw: Partial<SimulationInput> & { commissionCents: number }): SimulationResult {
  const input = sanitizeSimulation(raw);
  const clicks = input.videos * input.views * (input.clickRate / 100);
  const mid = clicks * (input.conversionRate / 100);
  const sales = {
    low: Math.floor(mid * SIMULATION_RANGE.low),
    mid: Math.round(mid),
    high: Math.round(mid * SIMULATION_RANGE.high),
  };
  return {
    clicks: Math.round(clicks),
    sales,
    commission_cents: {
      low: sales.low * input.commissionCents,
      mid: sales.mid * input.commissionCents,
      high: sales.high * input.commissionCents,
    },
  };
}
