'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { startTask } from '@/lib/tasks/start';
import { isScriptFormat, isTranslationLang, parseSettings } from '@/lib/ai/formats';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { deleteGeneration, getUsageToday, latestSettings, regenerateHookAt, setScriptSaved, StudioError } from '@/lib/studio';
import { editLine, rateScript, rewriteScript, translateDocScript, undoScript } from '@/lib/studio/edit';
import type { StudioDocView } from '@/lib/studio/types';
import { getPlan } from '@/lib/plans';

export interface StudioState {
  error?: string;
  code?: string;
}

export async function generateAction(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const productId = String(formData.get('produit') ?? '');
  const format = formData.get('format');
  if (!productId) return { error: 'Choisis un produit.' };
  if (!isScriptFormat(format)) return { error: 'Choisis un format de vidéo.' };
  const settings = parseSettings(
    { duration: formData.get('duree'), tone: formData.get('ton'), angle: formData.get('angle') },
    await latestSettings(profile),
  );

  // Vérifications rapides ici (quota du jour) ; l'écriture, longue, part en tâche d'arrière-plan.
  if ((await getUsageToday(profile)).remaining <= 0) {
    const plan = getPlan(profile.plan);
    return { error: `Tu as écrit tes ${plan.scriptsPerDay} scripts du jour (plan ${plan.name}). Ton compteur repart à zéro demain matin.`, code: 'limite' };
  }
  const brouillon = String(formData.get('brouillon') ?? '') || null;
  const path = await startTask(profile, 'studio', { produit: productId, format, reglages: settings, brouillon }, `/app/studio?produit=${encodeURIComponent(productId)}`);
  revalidatePath('/app/studio');
  redirect(path);
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '');
}

function intField(formData: FormData, name: string): number {
  const n = Number(formData.get(name));
  return Number.isInteger(n) ? n : -1;
}

function failure(id: string, error: unknown, fallback: string, script?: number): never {
  const message = error instanceof StudioError ? error.message : fallback;
  if (!(error instanceof StudioError)) console.error('[studio]', error);
  const where = script !== undefined && script >= 0 ? `&script=${script}#script-${script + 1}` : '';
  redirect(`/app/studio/${id}?erreur=${encodeURIComponent(message)}${where}`);
}

/** Après une retouche : la page se met à jour sur place (ou suit la fiche reprise d'une ancienne génération). */
function done(requestedId: string, doc: StudioDocView, script?: number) {
  revalidatePath(`/app/studio/${doc.id}`);
  revalidatePath('/app/studio');
  if (doc.id !== requestedId) redirect(`/app/studio/${doc.id}${script !== undefined ? `#script-${script + 1}` : ''}`);
}

export async function regenerateHookAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const id = field(formData, 'script');
  const index = intField(formData, 'index');
  let doc: StudioDocView;
  try {
    doc = await regenerateHookAt(profile, id, index);
  } catch (error) {
    failure(id, error, 'La nouvelle accroche n’a pas pu être écrite. Réessaie.');
  }
  revalidatePath(`/app/studio/${doc.id}`);
  redirect(`/app/studio/${doc.id}?nouvelle=${index}#accroches`);
}

export async function toggleSaveAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const id = field(formData, 'script');
  let doc: StudioDocView;
  try {
    doc = await setScriptSaved(profile, id, formData.get('garder') === '1');
  } catch (error) {
    failure(id, error, 'Le favori n’a pas pu être enregistré.');
  }
  done(id, doc);
}

export async function deleteScriptAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  await deleteGeneration(profile, field(formData, 'script'));
  revalidatePath('/app/studio');
  redirect('/app/studio?supprime=1');
}

export async function editLineAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const id = field(formData, 'id');
  const script = intField(formData, 'script');
  let doc: StudioDocView;
  try {
    doc = await editLine(profile, id, script, intField(formData, 'plan'));
  } catch (error) {
    failure(id, error, 'La ligne n’a pas pu être réécrite. Réessaie.', script);
  }
  done(id, doc, script);
}

export async function rewriteAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const id = field(formData, 'id');
  const script = intField(formData, 'script');
  const mode = field(formData, 'mode') === 'raccourcir' ? 'raccourcir' : 'percutant';
  let doc: StudioDocView;
  try {
    doc = await rewriteScript(profile, id, script, mode);
  } catch (error) {
    failure(id, error, 'La retouche n’a pas pu être faite. Réessaie.', script);
  }
  done(id, doc, script);
}

export async function undoAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const id = field(formData, 'id');
  const script = intField(formData, 'script');
  let doc: StudioDocView;
  try {
    doc = await undoScript(profile, id, script);
  } catch (error) {
    failure(id, error, 'La version précédente n’a pas pu être rétablie.', script);
  }
  done(id, doc, script);
}

export async function translateAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const id = field(formData, 'id');
  const script = intField(formData, 'script');
  const lang = formData.get('langue');
  if (!isTranslationLang(lang)) failure(id, new StudioError('invalide', 'Choisis l’allemand, l’italien ou l’espagnol.'), '', script);
  let doc: StudioDocView;
  try {
    doc = await translateDocScript(profile, id, script, lang);
  } catch (error) {
    failure(id, error, 'La traduction n’a pas pu être faite. Réessaie.', script);
  }
  done(id, doc, script);
}

export async function rateAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const id = field(formData, 'id');
  const script = intField(formData, 'script');
  const note = formData.get('note');
  const vendu = formData.get('vendu');
  let doc: StudioDocView;
  try {
    doc = await rateScript(profile, id, script, {
      ...(note !== null ? { stars: Number(note) } : {}),
      ...(vendu !== null ? { sold: vendu === 'oui' ? 'oui' : vendu === 'non' ? 'non' : null } : {}),
    });
  } catch (error) {
    failure(id, error, 'La note n’a pas pu être enregistrée.', script);
  }
  done(id, doc, script);
}
