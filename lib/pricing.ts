import type { PlanCard } from '@/components/pricing/pricing-cards';
import { getPlan, yearlyMonthlyEquivalent, yearlySavings } from '@/lib/plans';
import { formatEuros } from '@/lib/utils';

/** Contenu des cartes de prix, partagé entre la page publique et l'appli. */
export function pricingCards(): PlanCard[] {
  const card = (id: 'free' | 'pro' | 'proplus', tagline: string, features: PlanCard['features']): PlanCard => {
    const plan = getPlan(id);
    return {
      id,
      name: plan.name,
      tagline,
      monthly: formatEuros(plan.prices.month),
      yearly: formatEuros(plan.prices.year, { round: true }),
      yearlyMonthly: formatEuros(yearlyMonthlyEquivalent(id)),
      yearlySavings: formatEuros(yearlySavings(id), { round: true }),
      features,
    };
  };
  return [
    card('free', 'Pour découvrir et préparer ton compte.', [
      { text: '3 produits du jour dans tes niches', included: true },
      { text: '3 écritures de scripts par jour', included: true },
      { text: 'Récap du matin par e-mail', included: true },
      { text: 'Score d’opportunité', included: false },
      { text: 'Récap du matin sur Discord', included: false },
    ]),
    card('pro', 'Pour publier tous les jours sur les bons produits.', [
      { text: 'Radar complet de tes niches, avec filtres', included: true },
      { text: 'Score d’opportunité détaillé', included: true },
      { text: '30 écritures de scripts par jour', included: true },
      { text: 'Récap du matin sur Discord et par e-mail', included: true },
      { text: 'Suivi de tes produits et objectif 20 vidéos', included: true },
    ]),
    card('proplus', 'Pour les gros volumes, sans limite.', [
      { text: 'Tout le plan Pro', included: true },
      { text: 'Écritures de scripts illimitées', included: true },
      { text: 'Export de tous tes scripts', included: true },
      { text: 'Accès en priorité aux nouvelles fonctions', included: true },
    ]),
  ];
}
