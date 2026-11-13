/**
 * Hypothèses chiffrées de l'écran admin, réglables par variables d'environnement (lues ici, pas dans lib/env.ts).
 * Chaque valeur affichée dit d'où elle vient : mesurée, documentée, ou hypothèse à confirmer.
 */
function read(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function num(name: string, fallback: number | null): number | null {
  const raw = read(name).replace(',', '.');
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const adminSettings = {
  /** TVA française au taux normal : les prix des plans sont TTC. */
  get vatRate() {
    return num('ADMIN_VAT_RATE', 0.2)!;
  },
  /** Prix de 1 000 crédits Nexscope en euros : inconnu par défaut (le coût reste affiché en crédits). */
  get nexscopeEurPer1000Credits() {
    return num('NEXSCOPE_EUR_PER_1000_CREDITS', null);
  },
  /** Conversion des coûts d'IA facturés en dollars. Hypothèse par défaut : 1 $ = 1 € (prudente si le dollar vaut moins). */
  get usdToEur() {
    return num('ADMIN_USD_EUR_RATE', 1)!;
  },
  /** Frais Stripe par paiement : 1,5 % + 0,25 € (tarif standard des cartes de l'Espace économique européen, à vérifier). */
  get stripeFeePercent() {
    return num('ADMIN_STRIPE_FEE_PERCENT', 1.5)!;
  },
  get stripeFeeFixedCents() {
    return num('ADMIN_STRIPE_FEE_FIXED_CENTS', 25)!;
  },
  /** Coûts fixes mensuels (hébergement, domaine, abonnements) en euros : 0 tant qu'ils ne sont pas renseignés. */
  get fixedCostsEurPerMonth() {
    return num('ADMIN_FIXED_COSTS_EUR_MONTH', 0)!;
  },
  /** Prix de l'IA par million de jetons (entrée, sortie), en dollars, si le modèle n'est pas dans la table connue. */
  get aiPriceOverride(): { input: number; output: number } | null {
    const input = num('AI_PRICE_INPUT_PER_MTOK', null);
    const output = num('AI_PRICE_OUTPUT_PER_MTOK', null);
    return input !== null && output !== null ? { input, output } : null;
  },
};
