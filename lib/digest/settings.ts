import { getRepo, type Repo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';

/**
 * Réglages des deux récaps. Le récap du matin garde ses colonnes du profil (heure, e-mail, Discord) ; ce qui est
 * nouveau (push du matin, tout le récap du dimanche) vit dans une fiche `recap_reglages` (une par utilisateur), pour
 * ne pas toucher au schéma.
 */
export const RECAP_SETTINGS_KIND = 'recap_reglages';

/** Heures proposées pour le récap du dimanche (heure de Paris). */
export const SUNDAY_HOURS = [8, 9, 10, 11, 12, 14, 16, 17, 18, 19, 20, 21] as const;
export const DEFAULT_SUNDAY_HOUR = 18;

export interface RecapSettings {
  matin: { push: boolean };
  dimanche: { heure: number; email: boolean; discord: boolean; push: boolean };
}

export interface RecapChannels {
  heure: number;
  email: boolean;
  discord: boolean;
  push: boolean;
}

/**
 * Valeurs par défaut : le récap du dimanche suit le choix fait pour l'e-mail du matin (quelqu'un qui a coupé l'e-mail du
 * matin ne reçoit pas un nouvel e-mail sans l'avoir demandé), Discord et push restent à activer soi-même.
 */
export function defaultRecapSettings(profile: Pick<Profile, 'digest_email'>): RecapSettings {
  return { matin: { push: false }, dimanche: { heure: DEFAULT_SUNDAY_HOUR, email: profile.digest_email, discord: false, push: false } };
}

/** Réglages complets à partir d'une fiche (éventuellement absente ou incomplète). */
export function normalizeRecapSettings(raw: Partial<RecapSettings> | null | undefined, profile: Pick<Profile, 'digest_email'>): RecapSettings {
  const base = defaultRecapSettings(profile);
  const sunday = { ...base.dimanche, ...(raw?.dimanche ?? {}) };
  return {
    matin: { push: Boolean(raw?.matin?.push ?? base.matin.push) },
    dimanche: {
      heure: (SUNDAY_HOURS as readonly number[]).includes(Number(sunday.heure)) ? Number(sunday.heure) : DEFAULT_SUNDAY_HOUR,
      email: Boolean(sunday.email),
      discord: Boolean(sunday.discord),
      push: Boolean(sunday.push),
    },
  };
}

export async function getRecapSettings(
  profile: Pick<Profile, 'id' | 'digest_email'>,
  repo: Repo = getRepo(),
): Promise<RecapSettings & { recordId: string | null }> {
  const [record] = await repo.listRecords<Partial<RecapSettings>>(profile.id, RECAP_SETTINGS_KIND);
  return { ...normalizeRecapSettings(record?.data, profile), recordId: record?.id ?? null };
}

export async function saveRecapSettings(
  profile: Pick<Profile, 'id' | 'digest_email'>,
  patch: { matin?: Partial<RecapSettings['matin']>; dimanche?: Partial<RecapSettings['dimanche']> },
  repo: Repo = getRepo(),
): Promise<RecapSettings> {
  const current = await getRecapSettings(profile, repo);
  const next = normalizeRecapSettings(
    { matin: { ...current.matin, ...patch.matin }, dimanche: { ...current.dimanche, ...patch.dimanche } },
    profile,
  );
  await repo.saveRecord(profile.id, RECAP_SETTINGS_KIND, next, current.recordId ?? undefined);
  return next;
}

/** Canaux effectifs du récap du matin (heure, e-mail et Discord sur le profil ; push dans la fiche). */
export function morningChannels(profile: Profile, settings: RecapSettings): RecapChannels {
  return { heure: profile.digest_hour, email: profile.digest_email, discord: profile.digest_discord, push: settings.matin.push };
}
