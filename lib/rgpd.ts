import { BRAND, BRAND_SLUG } from '@/lib/brand';
import { getRepo, type Repo } from '@/lib/db';
import type { UserRecord } from '@/lib/db/types';

/**
 * RGPD, droit d'accès et de portabilité (articles 15 et 20) : toutes les données du compte dans un fichier JSON lisible
 * par une machine, téléchargeable depuis la page Compte. Les fiches sont rangées par type, quel que soit le module qui
 * les a créées : un nouveau type de fiche est exporté sans rien changer ici.
 *
 * Seule exception : les clés de chiffrement des abonnements push (secret propre au navigateur, inutile hors de lui)
 * sont masquées ; l'adresse d'abonnement et l'appareil restent.
 */
export const EXPORT_VERSION = 2;
const MASKED = '[clé technique masquée]';

function redact(record: UserRecord): UserRecord {
  if (record.kind !== 'push_abonnement') return record;
  const data = record.data as { keys?: Record<string, string> };
  return { ...record, data: { ...data, keys: data.keys ? Object.fromEntries(Object.keys(data.keys).map((k) => [k, MASKED])) : undefined } };
}

export async function buildDataExport(userId: string, repo: Repo = getRepo(), now = new Date()) {
  const data = await repo.exportUserData(userId);
  const records: Record<string, unknown[]> = {};
  for (const record of data.records.map(redact)) {
    (records[record.kind] ??= []).push({ id: record.id, cree_le: record.created_at, modifie_le: record.updated_at, donnees: record.data });
  }
  return {
    format: `${BRAND_SLUG}-export`,
    version: EXPORT_VERSION,
    genere_le: now.toISOString(),
    service: BRAND,
    a_savoir: [
      'Ce fichier contient toutes les données liées à ton compte dans notre base : profil, scripts, produits suivis, récaps, abonnements, rattachements (formateur) et fiches (gains, plans de publication, notifications, réglages…).',
      'Les données des autres personnes (élèves, personnes invitées) n’y figurent pas : seuls le statut et les montants des rattachements sont donnés.',
      'Les factures et moyens de paiement sont chez Stripe : retrouve-les depuis « Gérer mon abonnement » (portail Stripe).',
      'Les produits du catalogue ne sont pas des données personnelles : seuls leurs identifiants apparaissent dans tes fiches.',
    ],
    profil: data.profile,
    scripts: data.scripts,
    produits_suivis: data.saved_products,
    abonnements: data.subscriptions,
    scripts_par_jour: data.usage,
    recaps_du_matin: data.digests,
    fiches: records,
    rattachements: { faits: data.referrals_made, recu: data.referral_received, commissions: data.commissions },
    formateur: data.coach,
    demandes_de_partenariat: data.coach_applications,
  };
}

export function exportFileName(now = new Date()): string {
  return `${BRAND_SLUG}-mes-donnees-${now.toISOString().slice(0, 10)}.json`;
}
