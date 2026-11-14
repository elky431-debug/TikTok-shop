import type { Metadata } from 'next';
import { StoreManager, type ManagerTab, type ReactFlash } from '@/components/manager/store-manager';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { parisDate, plural } from '@/lib/utils';
import { loadManager } from '@/lib/v2/manager';

export const metadata: Metadata = { title: 'Gestionnaire' };

const TABS: ManagerTab[] = ['gestion', 'echantillons', 'videos', 'commissions', 'calendrier'];

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

function flashFrom(searchParams: Record<string, string | undefined>): ReactFlash {
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

export default async function GestionnairePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/gestionnaire');
  const today = parisDate();
  const data = await loadManager(getRepo(), profile.id, { today, canEarnings: getPlan(profile.plan).earnings });
  const tab = TABS.includes(searchParams.onglet as ManagerTab) ? (searchParams.onglet as ManagerTab) : 'gestion';
  return (
    <div>
      <StoreManager data={data} initialTab={tab} initialProduct={searchParams.produit ?? null} flash={flashFrom(searchParams)} />
    </div>
  );
}
