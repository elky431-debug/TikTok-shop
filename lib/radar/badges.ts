import { NEW_PRODUCT_DAYS, type ProductMetrics } from './metrics';

/**
 * Badges automatiques, calculés uniquement sur les chiffres de la source (module pur). Aucun badge n'est posé sur
 * une donnée absente : sans nombre d'affiliés, ni « Sous-exploité » ni « Saturé » ; sans date de premier relevé, pas
 * de « Nouveau ». Règles chiffrées : docs/session5/blocs1-2-3.md (B4).
 */
export type BadgeId = 'nouveau' | 'acceleration' | 'sous_exploite' | 'sature' | 'baisse';

export const BADGE_IDS: BadgeId[] = ['nouveau', 'acceleration', 'sous_exploite', 'sature', 'baisse'];

export const BADGE_RULES = {
  /** Vu pour la première fois par la source il y a moins de 30 jours. */
  newMaxDays: NEW_PRODUCT_DAYS,
  /** Chaque rythme plus court vend au moins 25 % de plus par jour que le plus long (derniers jours > 7 j > 30 j)… */
  accelerationRatio: 1.25,
  /** … avec au moins 5 ventes par jour sur 7 jours (deux ventes qui passent à trois ne sont pas une accélération). */
  accelerationMinDaily: 5,
  /** Au moins 20 ventes par jour sur 7 jours… */
  underexploitedMinDaily: 20,
  /** … pour au plus 1 affilié pour 2 ventes quotidiennes (même seuil que « peu d'affiliés » dans le score). */
  underexploitedMaxRatio: 0.5,
  /** Au moins 5 affiliés par vente quotidienne… */
  saturatedMinRatio: 5,
  /** … et au moins 30 affiliés. */
  saturatedMinAffiliates: 30,
  /** Croissance sur 7 jours de −20 % ou moins (seuil « baisse » du score)… */
  declineGrowth: -0.2,
  /** … ou, tant que la croissance n'est pas mesurable, rythme sur 7 jours sous 70 % du rythme sur 30 jours. */
  declinePaceRatio: 0.7,
} as const;

export const BADGES: Record<BadgeId, { label: string; tone: 'cyan' | 'rose' | 'gain' | 'warn' | 'neutral'; rule: string }> = {
  nouveau: {
    label: 'Nouveau',
    tone: 'cyan',
    rule: 'Vu pour la première fois par la source il y a moins de 30 jours.',
  },
  acceleration: {
    label: 'En accélération',
    tone: 'rose',
    rule: 'Les ventes par jour des derniers jours dépassent de 25 % celles de la semaine, qui dépassent de 25 % celles du mois (au moins 5 ventes par jour).',
  },
  sous_exploite: {
    label: 'Sous-exploité',
    tone: 'gain',
    rule: 'Au moins 20 ventes par jour, pour au plus 1 affilié pour 2 ventes quotidiennes : peu de créateurs dessus.',
  },
  sature: {
    label: 'Saturé',
    tone: 'warn',
    rule: 'Au moins 30 affiliés, et 5 affiliés ou plus par vente quotidienne : beaucoup de créateurs pour peu de ventes.',
  },
  baisse: {
    label: 'En baisse',
    tone: 'warn',
    rule: 'Ventes en baisse de 20 % ou plus sur 7 jours (ou, avant la mesure de la croissance, rythme de la semaine sous 70 % de celui du mois).',
  },
};

export function badgesFor(m: ProductMetrics): BadgeId[] {
  const badges: BadgeId[] = [];
  const r = BADGE_RULES;
  if (m.age_days !== null && m.age_days < r.newMaxDays) badges.push('nouveau');

  const { recent, week, month } = m.pace;
  const declining =
    m.growth_7d !== null ? m.growth_7d <= r.declineGrowth : week !== null && month !== null && month > 0 && week <= r.declinePaceRatio * month;
  const accelerating =
    !declining &&
    recent !== null &&
    week !== null &&
    month !== null &&
    week >= r.accelerationMinDaily &&
    week >= r.accelerationRatio * month &&
    recent >= r.accelerationRatio * week;
  if (accelerating) badges.push('acceleration');

  if (m.affiliates !== null && m.daily_sales !== null) {
    const ratio = m.affiliates / Math.max(1, m.daily_sales);
    if (m.daily_sales >= r.underexploitedMinDaily && ratio <= r.underexploitedMaxRatio) badges.push('sous_exploite');
    else if (m.affiliates >= r.saturatedMinAffiliates && ratio >= r.saturatedMinRatio) badges.push('sature');
  }
  if (declining) badges.push('baisse');
  return badges;
}
