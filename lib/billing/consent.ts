import type { Repo } from '@/lib/db';
import type { BillingInterval, Profile, UserRecord } from '@/lib/db/types';
import type { PaidPlanId } from '@/lib/plans';

/**
 * Démarrage immédiat et délai de rétractation de 14 jours (Code de la consommation, art. L221-18 et L221-25) : un
 * abonnement conclu à distance ne peut démarrer avant la fin du délai que si le client le demande expressément ; s'il
 * se rétracte ensuite, il paie le service fourni jusqu'à sa rétractation, au prorata du prix. La case est obligatoire
 * avant le paiement (vérifiée côté serveur) ; la demande est enregistrée par le serveur (fiche non modifiable depuis le
 * navigateur) puis confirmée par e-mail (support durable, art. L221-13). Texte à faire relire par un juriste.
 */
export const WITHDRAWAL_CONSENT_VERSION = '2026-11-13';

export const WITHDRAWAL_CONSENT_TEXT =
  'Je demande que mon abonnement démarre tout de suite, avant la fin du délai de rétractation de 14 jours. ' +
  'J’ai bien noté que si je me rétracte pendant ce délai, je paierai le service fourni jusqu’à ma rétractation, ' +
  'au prorata du prix (article L221-25 du Code de la consommation).';

/** Nom du champ de la case dans les formulaires de paiement. */
export const WITHDRAWAL_CONSENT_FIELD = 'demarrage_immediat';

export const CONSENT_KIND = 'consentement_paiement';

export interface ConsentData {
  text: string;
  version: string;
  plan: PaidPlanId;
  interval: BillingInterval;
  accepted_at: string;
}

export function consentGiven(formData: FormData): boolean {
  return formData.get(WITHDRAWAL_CONSENT_FIELD) === 'oui';
}

/** Enregistre la demande de démarrage immédiat, juste avant d'envoyer au paiement. */
export async function recordConsent(
  repo: Repo,
  profile: Profile,
  input: { plan: PaidPlanId; interval: BillingInterval },
  now = new Date(),
): Promise<UserRecord<ConsentData>> {
  return repo.saveRecord<ConsentData>(profile.id, CONSENT_KIND, {
    text: WITHDRAWAL_CONSENT_TEXT,
    version: WITHDRAWAL_CONSENT_VERSION,
    plan: input.plan,
    interval: input.interval,
    accepted_at: now.toISOString(),
  });
}

/** Dernière demande enregistrée (pour l'e-mail de confirmation). */
export async function latestConsent(repo: Repo, userId: string): Promise<ConsentData | null> {
  const records = await repo.listRecords<ConsentData>(userId, CONSENT_KIND);
  return records.map((r) => r.data).sort((a, b) => b.accepted_at.localeCompare(a.accepted_at))[0] ?? null;
}
