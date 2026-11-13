'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { startTask } from '@/lib/tasks/start';
import { requireOnboardedViewer } from '@/lib/auth/session';

export async function createSeriesAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio/serie');
  const productId = String(formData.get('produit') ?? '');
  if (!productId) redirect(`/app/studio/serie?erreur=${encodeURIComponent('Choisis un produit.')}`);
  const path = await startTask(profile, 'serie', { produit: productId }, '/app/studio/serie');
  revalidatePath('/app/studio/serie');
  redirect(path);
}

export async function writeAngleAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/studio/serie');
  const seriesId = String(formData.get('serie') ?? '');
  const index = Number(formData.get('angle'));
  const path = await startTask(profile, 'angle', { serie: seriesId, angle: index }, `/app/studio/serie/${seriesId}`);
  revalidatePath(`/app/studio/serie/${seriesId}`);
  revalidatePath('/app/studio');
  redirect(path);
}
