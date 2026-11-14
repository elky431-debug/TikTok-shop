import type { PlanCard } from '@/components/pricing/pricing-cards';
import { annualOffer } from '@/lib/billing/annual-offer';
import { getPlan, PAID_PLANS, RECOMMENDED_PLAN, yearlyMonthlyEquivalent, yearlySavings, type PaidPlanId } from '@/lib/plans';
import { formatEuros } from '@/lib/utils';

/**
 * Ce que contient chaque plan, résumé pour la page Tarifs (grille complète et limites exactes : lib/plans.ts et CGV).
 */
const CONTENT: Record<PaidPlanId, { tagline: string; intro?: string; features: string[] }> = {
  starter: {
    tagline: 'Tu trouves les produits et tu écris tes scripts.',
    features: ['Radar des produits qui montent', '10 scripts par jour', 'Téléprompteur', 'Plan de publication', 'Récap du matin'],
  },
  pro: {
    tagline: 'Plus de volume, et tu suis tes gains.',
    intro: 'Tout le Starter, plus :',
    features: ['40 scripts par jour', 'Série de 20 vidéos', 'Suivi des gains', 'Analyse de vidéos', 'Propositions de marques'],
  },
  elite: {
    tagline: 'Tout en illimité, sur quatre pays.',
    intro: 'Tout le Pro, plus :',
    features: ['Tout en illimité', 'France, Allemagne, Italie et Espagne'],
  },
};

/** Contenu des cartes de prix, partagé entre la page publique, le choix de l'abonnement et l'appli. */
export function pricingCards(): PlanCard[] {
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
      features: content.features.map((text) => ({ text, included: true })),
    };
  });
}

/**
 * Libellé de l'économie annuelle, commun aux trois plans (l'annuel vaut 8 mois : « 4 mois offerts · −33 % »), calculé
 * depuis les prix du plan recommandé.
 */
export function yearlyBadge(): string {
  const offer = annualOffer(RECOMMENDED_PLAN);
  return `${offer.badge} · −${offer.percent} %`;
}

/** « 4 mois offerts » seul, pour les phrases. */
export function yearlyFreeMonthsLabel(): string {
  return annualOffer(RECOMMENDED_PLAN).badge;
}
