import type { PlanCard } from '@/components/pricing/pricing-cards';
import { annualOffer } from '@/lib/billing/annual-offer';
import { discountedFirstMonth } from '@/lib/billing/coach-discount';
import { getPlan, PAID_PLANS, RECOMMENDED_PLAN, yearlyMonthlyEquivalent, yearlySavings, type PaidPlanId } from '@/lib/plans';
import { formatEuros } from '@/lib/utils';

/** Ce que contient chaque plan, dans l'ordre de la grille (13 novembre 2026). */
const CONTENT: Record<PaidPlanId, { tagline: string; intro?: string; features: string[] }> = {
  starter: {
    tagline: 'Pour lancer ton compte sur les bons produits.',
    features: [
      'Radar France complet, score expliqué et fiche produit',
      '10 scripts par jour, 5 formats',
      'Téléprompteur',
      '10 produits suivis',
      'Plan de publication',
      'Récap du matin',
      '3 alertes',
      '3 recherches par jour',
      'Mode préparation',
      'Parrainage',
    ],
  },
  pro: {
    tagline: 'Pour publier tous les jours et suivre ce qui marche.',
    intro: 'Tout le Starter, plus :',
    features: [
      '40 scripts par jour, les 8 formats',
      'Style personnel',
      'Série de 20 vidéos',
      'Score « pour toi »',
      'Produits suivis illimités',
      'Suivi des gains et import CSV',
      '20 analyses de vidéo par mois',
      '20 propositions de marques par mois',
      'Comparateur',
      '15 alertes',
      '15 recherches par jour',
      'Récap de la semaine',
    ],
  },
  elite: {
    tagline: 'Pour les gros volumes et l’Europe.',
    intro: 'Tout le Pro en illimité, plus :',
    features: [
      'Allemagne, Italie et Espagne',
      'Traduction des scripts',
      'Poids du score réglables',
      'Export CSV',
      '50 recherches par jour',
    ],
  },
};

/**
 * Contenu des cartes de prix, partagé entre la page publique, le choix de l'abonnement et l'appli. `coachDiscount` :
 * l'élève d'un formateur voit le prix de son premier mois avec −20 %.
 */
export function pricingCards(options: { coachDiscount?: boolean } = {}): PlanCard[] {
  return PAID_PLANS.map((id) => {
    const plan = getPlan(id);
    const content = CONTENT[id];
    return {
      id,
      name: plan.name,
      tagline: content.tagline,
      intro: content.intro,
      recommended: id === RECOMMENDED_PLAN,
      monthly: formatEuros(plan.prices.month),
      yearly: formatEuros(plan.prices.year),
      yearlyMonthly: formatEuros(yearlyMonthlyEquivalent(id)),
      yearlySavings: formatEuros(yearlySavings(id)),
      firstMonth: options.coachDiscount ? formatEuros(discountedFirstMonth(id)) : null,
      features: content.features.map((text) => ({ text, included: true })),
    };
  });
}

/** Libellé de l'économie annuelle, commun aux trois plans (l'annuel vaut 10 mois : « 2 mois offerts »). */
export function yearlyBadge(): string {
  return annualOffer(RECOMMENDED_PLAN).badge;
}
