/**
 * E-mails de cycle de vie : chacun part une seule fois (clé d'envoi gardée dans la fiche `cycle_vie_envois`), chacun se
 * coupe dans le compte. Deux familles, chacune avec son lien de désinscription en un clic.
 */
export const LIFECYCLE_TYPES = ['bienvenue', 'astuce_j1', 'rappel_j3', 'reactivation', 'fin_essai', 'relance_paiement'] as const;
export type LifecycleType = (typeof LIFECYCLE_TYPES)[number];

export type LifecycleGroup = 'conseils' | 'abonnement';

export const LIFECYCLE_INFO: Record<LifecycleType, { label: string; description: string; group: LifecycleGroup }> = {
  bienvenue: { label: 'Bienvenue', description: 'Le jour de ton inscription : comment tirer le meilleur de l’outil.', group: 'conseils' },
  astuce_j1: { label: 'Astuce du lendemain', description: 'Le lendemain : la méthode des 20 vidéos sur un même produit.', group: 'conseils' },
  rappel_j3: { label: 'Rappel du 3e jour', description: 'Seulement si tu n’as encore écrit aucun script.', group: 'conseils' },
  reactivation: { label: 'Nouvelles après une absence', description: 'Après 14 jours sans ouvrir l’appli : tes produits du moment.', group: 'conseils' },
  fin_essai: { label: 'Fin de l’essai offert', description: 'Trois jours avant la fin d’un essai offert avant la nouvelle grille de prix.', group: 'abonnement' },
  relance_paiement: {
    label: 'Relance de paiement',
    description: 'Si un prélèvement reste refusé trois jours, en plus de l’e-mail envoyé à chaque essai de la banque.',
    group: 'abonnement',
  },
};

export function isLifecycleType(value: unknown): value is LifecycleType {
  return (LIFECYCLE_TYPES as readonly unknown[]).includes(value);
}

export function typesOfGroup(group: LifecycleGroup): LifecycleType[] {
  return LIFECYCLE_TYPES.filter((t) => LIFECYCLE_INFO[t].group === group);
}
