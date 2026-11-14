import type { ManagerTab, ReactFlash } from '@/components/manager/store-manager';
import { plural } from '@/lib/utils';

/** Messages affichés après une action du gestionnaire (statut, échantillon, vidéo, commission, import). */
export const MANAGER_TAB_IDS: ManagerTab[] = ['produits', 'echantillons', 'videos', 'commissions', 'calendrier'];

export function managerTab(value: string | undefined): ManagerTab {
  return MANAGER_TAB_IDS.includes(value as ManagerTab) ? (value as ManagerTab) : 'produits';
}

const OK: Record<string, string> = {
  statut: 'Statut mis à jour.',
  demande: 'Demande d’échantillon ajoutée.',
  relance: 'Relance notée.',
  recu: 'Échantillon reçu.',
  suppression: 'Supprimé.',
  video: 'Vidéo enregistrée.',
  ajout: 'Commission ajoutée.',
  objectif: 'Objectif enregistré.',
  annule: 'Import annulé.',
  oubli: 'Colonnes oubliées : le prochain import te les redemandera.',
};

const ERRORS: Record<string, string> = {
  produit: 'Choisis un de tes produits suivis.',
  echantillon: 'Cette demande n’existe plus.',
  lien: 'Ce lien ne ressemble pas à une adresse web.',
  complet: 'Toutes les vidéos de ce produit sont déjà en ligne : augmente l’objectif dans sa fiche.',
  saisie: 'Indique une date, un montant et un produit.',
  objectif: 'Objectif non compris : écris un montant, comme 500.',
  fichier: 'Choisis un fichier CSV.',
  taille: 'Fichier trop lourd (2 Mo au plus).',
  vide: 'Ce fichier ne contient pas de lignes lisibles.',
  expire: 'Ce fichier n’est plus disponible : importe-le à nouveau.',
};

export function managerFlash(searchParams: Record<string, string | undefined>): ReactFlash {
  if (searchParams.erreur) return { tone: 'erreur', message: ERRORS[searchParams.erreur] ?? 'Action non faite.' };
  if (searchParams.ok === 'import') {
    const lines = Number(searchParams.lignes ?? 0);
    const duplicates = Number(searchParams.doublons ?? 0);
    const ignored = Number(searchParams.ignorees ?? 0);
    return {
      tone: 'ok',
      message: [
        `${plural(lines, 'ligne importée', 'lignes importées')}`,
        duplicates ? `${plural(duplicates, 'doublon ignoré', 'doublons ignorés')}` : null,
        ignored ? `${plural(ignored, 'ligne illisible', 'lignes illisibles')}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }
  return searchParams.ok && OK[searchParams.ok] ? { tone: 'ok', message: OK[searchParams.ok] } : null;
}
