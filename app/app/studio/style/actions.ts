'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { startTask } from '@/lib/tasks/start';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { StudioError } from '@/lib/studio';
import { deleteStyle, setStyleEnabled, updateStyleProfile } from '@/lib/studio/style';

function fail(error: unknown, fallback: string): never {
  const text = error instanceof StudioError ? error.message : fallback;
  if (!(error instanceof StudioError)) console.error('[studio] style', error);
  redirect(`/app/studio/style?erreur=${encodeURIComponent(text)}`);
}

export async function analyzeStyleAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio/style');
  const samples = formData.getAll('texte').map((v) => String(v).slice(0, 5000)).slice(0, 10);
  const path = await startTask(profile, 'style', { textes: samples }, '/app/studio/style');
  revalidatePath('/app/studio/style');
  revalidatePath('/app/studio');
  redirect(path);
}

export async function updateStyleAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio/style');
  const get = (name: string) => String(formData.get(name) ?? '');
  try {
    await updateStyleProfile(profile, {
      summary: get('resume'),
      tone: get('ton'),
      expressions: get('expressions'),
      openings: get('debuts'),
      closings: get('fins'),
      do: get('a_faire'),
      avoid: get('a_eviter'),
    });
  } catch (error) {
    fail(error, 'Tes modifications n’ont pas pu être enregistrées.');
  }
  revalidatePath('/app/studio/style');
  redirect('/app/studio/style?ok=modifie');
}

export async function toggleStyleAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio/style');
  await setStyleEnabled(profile, formData.get('actif') === '1');
  revalidatePath('/app/studio/style');
  revalidatePath('/app/studio');
}

export async function deleteStyleAction() {
  const { profile } = await requireOnboardedViewer('/app/studio/style');
  await deleteStyle(profile);
  revalidatePath('/app/studio/style');
  revalidatePath('/app/studio');
  redirect('/app/studio/style?ok=supprime');
}
