'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isScriptFormat } from '@/lib/ai/formats';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { createScripts, regenerateHookAt, setScriptSaved, StudioError } from '@/lib/studio';

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

  let id: string;
  try {
    const record = await createScripts(profile, productId, format);
    id = record.id;
  } catch (error) {
    if (error instanceof StudioError) return { error: error.message, code: error.code };
    console.error('[studio] génération', error);
    return { error: 'L’écriture des scripts a échoué. Réessaie dans un instant.' };
  }
  revalidatePath('/app/studio');
  redirect(`/app/studio/${id}`);
}

export async function regenerateHookAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const id = String(formData.get('script') ?? '');
  const index = Number(formData.get('index'));
  try {
    await regenerateHookAt(profile, id, index);
  } catch (error) {
    const message = error instanceof StudioError ? error.message : 'La nouvelle accroche n’a pas pu être écrite. Réessaie.';
    redirect(`/app/studio/${id}?erreur=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/app/studio/${id}`);
  redirect(`/app/studio/${id}?nouvelle=${index}#accroches`);
}

export async function toggleSaveAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const id = String(formData.get('script') ?? '');
  const saved = formData.get('garder') === '1';
  await setScriptSaved(profile, id, saved);
  revalidatePath(`/app/studio/${id}`);
  revalidatePath('/app/studio');
}

export async function deleteScriptAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio');
  const id = String(formData.get('script') ?? '');
  await getRepo().deleteScript(profile.id, id);
  revalidatePath('/app/studio');
  redirect('/app/studio?supprime=1');
}
