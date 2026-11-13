import { punchierScript, rewriteLine, shortenScript, translateScript, type EditContext } from '@/lib/ai/edits';
import { LANG_LABELS, type TranslationLang } from '@/lib/ai/formats';
import { ensureCommercialMention } from '@/lib/ai/guard';
import type { StudioScript } from '@/lib/ai/types';
import { getRepo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { aiFailure, StudioError } from './errors';
import { studioRights } from './limits';
import { getDoc, updateDoc } from './store';
import { activeStyle } from './style';
import type { StudioDocView, StudioRating } from './types';

/**
 * Retouches et notes d'un script d'une génération. Chaque retouche IA compte dans la limite de retouches de la
 * génération (selon le plan) ; la version précédente est gardée (une retouche annulable) ; la mention de
 * collaboration commerciale est revérifiée après chaque changement.
 */

async function load(profile: Profile, docId: string, scriptIndex: number) {
  const doc = await getDoc(profile.id, docId);
  if (!doc) throw new StudioError('produit', 'Ce script est introuvable.');
  const script = doc.scripts[scriptIndex];
  if (!script) throw new StudioError('invalide', 'Ce script n’existe pas dans cette génération.');
  return { doc, script };
}

async function contextFor(profile: Profile, doc: StudioDocView): Promise<EditContext> {
  const product = await getRepo().getProduct(doc.product_id);
  return {
    product: { name: product?.name ?? doc.product_name, description: product?.description ?? '', price_cents: product?.price_cents ?? 0 },
    format: doc.format,
    settings: doc.settings,
    personalStyle: await activeStyle(profile),
  };
}

export function editsLeft(profile: Profile, doc: Pick<StudioDocView, 'edit_count'>): number {
  return Math.max(0, studioRights(profile.plan).editsPerGeneration - doc.edit_count);
}

function assertEditsLeft(profile: Profile, doc: StudioDocView) {
  if (editsLeft(profile, doc) <= 0) {
    throw new StudioError(
      'retouches',
      `Tu as fait les ${studioRights(profile.plan).editsPerGeneration} retouches possibles sur cette génération. Écris de nouveaux scripts pour continuer.`,
    );
  }
}

/** Remplace le script n°i par sa nouvelle version, garde l'ancienne, incrémente la version et le compteur. */
async function commit(profile: Profile, doc: StudioDocView, index: number, next: StudioScript, simulated: boolean): Promise<StudioDocView> {
  const scripts = doc.scripts.map((s, i) => (i === index ? ensureCommercialMention(next) : s));
  return updateDoc(profile.id, doc, {
    scripts,
    previous: doc.previous.map((p, i) => (i === index ? doc.scripts[index] : p)),
    versions: doc.versions.map((v, i) => (i === index ? v + 1 : v)),
    edit_count: doc.edit_count + 1,
    simulated_edits: doc.simulated_edits + (simulated ? 1 : 0),
  });
}

/** Réécrit une seule ligne (ce qui est dit et le texte à l'écran d'un plan). */
export async function editLine(profile: Profile, docId: string, scriptIndex: number, shotIndex: number): Promise<StudioDocView> {
  const { doc, script } = await load(profile, docId, scriptIndex);
  if (!script.shots[shotIndex]) throw new StudioError('invalide', 'Cette ligne n’existe pas.');
  assertEditsLeft(profile, doc);
  let result;
  try {
    result = await rewriteLine(script, shotIndex, await contextFor(profile, doc), `${doc.id}|${doc.edit_count}`);
  } catch (error) {
    throw aiFailure(error, 'La nouvelle ligne');
  }
  const shots = script.shots.map((s, i) => (i === shotIndex ? { ...s, ...result.data } : s));
  return commit(profile, doc, scriptIndex, { ...script, shots }, result.simulated);
}

export type RewriteMode = 'raccourcir' | 'percutant';

export async function rewriteScript(profile: Profile, docId: string, scriptIndex: number, mode: RewriteMode): Promise<StudioDocView> {
  const { doc, script } = await load(profile, docId, scriptIndex);
  assertEditsLeft(profile, doc);
  let result;
  try {
    const ctx = await contextFor(profile, doc);
    result = mode === 'raccourcir' ? await shortenScript(script, ctx) : await punchierScript(script, ctx);
  } catch (error) {
    throw aiFailure(error, mode === 'raccourcir' ? 'La version courte' : 'La version plus percutante');
  }
  return commit(profile, doc, scriptIndex, result.data, result.simulated);
}

/**
 * Revient à la version d'avant la dernière retouche, sans compter de retouche. Les deux versions sont échangées :
 * recommencer rétablit la retouche.
 */
export async function undoScript(profile: Profile, docId: string, scriptIndex: number): Promise<StudioDocView> {
  const { doc, script } = await load(profile, docId, scriptIndex);
  const previous = doc.previous[scriptIndex];
  if (!previous) throw new StudioError('invalide', 'Il n’y a pas de version précédente pour ce script.');
  return updateDoc(profile.id, doc, {
    scripts: doc.scripts.map((s, i) => (i === scriptIndex ? previous : s)),
    previous: doc.previous.map((p, i) => (i === scriptIndex ? script : p)),
    versions: doc.versions.map((v, i) => (i === scriptIndex ? v + 1 : v)),
  });
}

/** Adapte un script pour l'Allemagne, l'Italie ou l'Espagne (Pro+). Compte comme une retouche. */
export async function translateDocScript(profile: Profile, docId: string, scriptIndex: number, lang: TranslationLang): Promise<StudioDocView> {
  if (!studioRights(profile.plan).translation) {
    throw new StudioError('plan', 'La traduction pour les marchés européens est disponible avec le plan Pro+.');
  }
  const { doc, script } = await load(profile, docId, scriptIndex);
  const existing = doc.translations[scriptIndex]?.[lang];
  if (existing && existing.version === doc.versions[scriptIndex]) return doc;
  assertEditsLeft(profile, doc);
  let result;
  try {
    result = await translateScript(script, lang, await contextFor(profile, doc));
  } catch (error) {
    throw aiFailure(error, `La version en ${LANG_LABELS[lang].toLowerCase()}`);
  }
  const translations = doc.translations.map((t, i) =>
    i === scriptIndex
      ? {
          ...t,
          [lang]: {
            lang,
            script: ensureCommercialMention(result.data, lang),
            version: doc.versions[scriptIndex],
            simulated: result.simulated,
            at: new Date().toISOString(),
          },
        }
      : t,
  );
  return updateDoc(profile.id, doc, { translations, edit_count: doc.edit_count + 1, simulated_edits: doc.simulated_edits + (result.simulated ? 1 : 0) });
}

/** Note (1 à 5) et « a vendu ? » d'un script. Une valeur absente garde la précédente ; 0 efface la note. */
export async function rateScript(
  profile: Profile,
  docId: string,
  scriptIndex: number,
  input: { stars?: number | null; sold?: 'oui' | 'non' | null },
): Promise<StudioDocView> {
  const { doc } = await load(profile, docId, scriptIndex);
  const current: StudioRating = doc.ratings[scriptIndex] ?? { stars: null, sold: null, at: new Date().toISOString() };
  let stars = current.stars;
  if (input.stars !== undefined) {
    if (input.stars === null || input.stars === 0) stars = null;
    else if (Number.isInteger(input.stars) && input.stars >= 1 && input.stars <= 5) stars = input.stars;
    else throw new StudioError('invalide', 'La note va de 1 à 5.');
  }
  const sold = input.sold !== undefined ? input.sold : current.sold;
  const rating: StudioRating | null = stars === null && sold === null ? null : { stars, sold, at: new Date().toISOString() };
  return updateDoc(profile.id, doc, { ratings: doc.ratings.map((r, i) => (i === scriptIndex ? rating : r)) });
}
