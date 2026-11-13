'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { StudioError } from '@/lib/studio';
import { createSeries, writeFromAngle } from '@/lib/studio/series';

function message(error: unknown, fallback: string): string {
  if (error instanceof StudioError) return error.message;
  console.error('[studio] série', error);
  return fallback;
}

export async function createSeriesAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio/serie');
  const productId = String(formData.get('produit') ?? '');
  if (!productId) redirect(`/app/studio/serie?erreur=${encodeURIComponent('Choisis un produit.')}`);
  let id: string;
  try {
    id = (await createSeries(profile, productId)).id;
  } catch (error) {
    redirect(`/app/studio/serie?erreur=${encodeURIComponent(message(error, 'La série n’a pas pu être créée. Réessaie dans un instant.'))}`);
  }
  revalidatePath('/app/studio/serie');
  redirect(`/app/studio/serie/${id}`);
}

export async function writeAngleAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio/serie');
  const seriesId = String(formData.get('serie') ?? '');
  const index = Number(formData.get('angle'));
  let docId: string;
  try {
    docId = (await writeFromAngle(profile, seriesId, index)).id;
  } catch (error) {
    redirect(
      `/app/studio/serie/${seriesId}?erreur=${encodeURIComponent(message(error, 'Les scripts n’ont pas pu être écrits. Réessaie dans un instant.'))}&angle=${index}#angle-${index + 1}`,
    );
  }
  revalidatePath(`/app/studio/serie/${seriesId}`);
  revalidatePath('/app/studio');
  redirect(`/app/studio/${docId}`);
}
