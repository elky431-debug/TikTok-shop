import { analyzeStyle, cleanSamples, sanitizeProfile, STYLE_MIN_SAMPLES } from '@/lib/ai/style';
import type { StyleProfile } from '@/lib/ai/types';
import { getRepo, type Repo } from '@/lib/db';
import type { Profile, UserRecord } from '@/lib/db/types';
import { aiFailure, StudioError } from './errors';
import { studioRights } from './limits';
import { leftToday, reserveToday } from './quota';
import { KIND_STYLE, KIND_STYLE_LOG, type StyleData } from './types';

/**
 * Style personnel (Pro et Pro+) : une seule fiche `style_perso` par personne, modifiable et supprimable. Les analyses
 * sont comptées dans un journal `style_analyse` (date seule, aucun texte) pour le quota du jour : supprimer son style
 * efface les textes, pas le compteur.
 */

export async function getStyle(userId: string, repo: Repo = getRepo()): Promise<UserRecord<StyleData> | null> {
  const records = await repo.listRecords<StyleData>(userId, KIND_STYLE);
  return records[0] ?? null;
}

/** Profil à donner à l'IA : seulement si le plan l'ouvre et que l'utilisateur l'a laissé actif. */
export async function activeStyle(profile: Profile, repo: Repo = getRepo()): Promise<StyleProfile | null> {
  if (!studioRights(profile.plan).personalStyle) return null;
  const record = await getStyle(profile.id, repo);
  return record?.data.enabled ? record.data.profile : null;
}

export async function styleAnalysesLeft(profile: Profile): Promise<number> {
  return leftToday(profile.id, KIND_STYLE_LOG, studioRights(profile.plan).styleAnalysesPerDay);
}

/** Analyse 3 à 5 textes et enregistre (ou remplace) le style. Quota réservé avant l'appel, rendu si l'IA échoue. */
export async function analyzeAndSaveStyle(profile: Profile, rawSamples: string[], repo: Repo = getRepo()): Promise<UserRecord<StyleData>> {
  const rights = studioRights(profile.plan);
  if (!rights.personalStyle) throw new StudioError('plan', 'Le style personnel est disponible avec le plan Pro.');
  const samples = cleanSamples(rawSamples);
  if (samples.length < STYLE_MIN_SAMPLES) {
    throw new StudioError('invalide', `Colle au moins ${STYLE_MIN_SAMPLES} textes différents de tes vidéos (40 caractères minimum chacun).`);
  }
  const log = await reserveToday(profile.id, KIND_STYLE_LOG, rights.styleAnalysesPerDay, { at: new Date().toISOString() });
  if (!log) {
    throw new StudioError('quota', `Tu as fait tes ${rights.styleAnalysesPerDay} analyses de style du jour. Réessaie demain, ou modifie ton style à la main.`);
  }
  let result;
  try {
    result = await analyzeStyle(samples);
  } catch (error) {
    await repo.deleteRecord(profile.id, log.id);
    throw aiFailure(error, 'Ton style');
  }
  const existing = await getStyle(profile.id, repo);
  const data: StyleData = {
    samples,
    profile: result.data,
    enabled: true,
    simulated: result.simulated,
    analyzed_at: new Date().toISOString(),
    edited_at: null,
  };
  return repo.saveRecord<StyleData>(profile.id, KIND_STYLE, data, existing?.id);
}

function lines(value: string, max: number): string[] {
  return value
    .split(/\n|;/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Modification à la main du profil (résumé, ton, expressions, débuts, fins, à faire, à éviter). */
export async function updateStyleProfile(
  profile: Profile,
  input: { summary: string; tone: string; expressions: string; openings: string; closings: string; do: string; avoid: string },
  repo: Repo = getRepo(),
): Promise<UserRecord<StyleData>> {
  if (!studioRights(profile.plan).personalStyle) throw new StudioError('plan', 'Le style personnel est disponible avec le plan Pro.');
  const existing = await getStyle(profile.id, repo);
  if (!existing) throw new StudioError('invalide', 'Analyse d’abord tes textes pour créer ton style.');
  const edited = sanitizeProfile({
    ...existing.data.profile,
    summary: input.summary.trim() || existing.data.profile.summary,
    tone: input.tone.trim() || existing.data.profile.tone,
    expressions: lines(input.expressions, 6),
    openings: lines(input.openings, 3),
    closings: lines(input.closings, 3),
    do: lines(input.do, 4),
    avoid: lines(input.avoid, 3),
  });
  return repo.saveRecord<StyleData>(profile.id, KIND_STYLE, { ...existing.data, profile: edited, edited_at: new Date().toISOString() }, existing.id);
}

export async function setStyleEnabled(profile: Profile, enabled: boolean, repo: Repo = getRepo()): Promise<void> {
  const existing = await getStyle(profile.id, repo);
  if (existing) await repo.saveRecord<StyleData>(profile.id, KIND_STYLE, { ...existing.data, enabled }, existing.id);
}

/** Supprime le style et les textes collés (toutes les fiches `style_perso`). */
export async function deleteStyle(profile: Profile, repo: Repo = getRepo()): Promise<void> {
  for (const record of await repo.listRecords(profile.id, KIND_STYLE)) await repo.deleteRecord(profile.id, record.id);
}
