'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { DEFAULT_VIDEO_GOAL } from '@/lib/plans';
import { canAccessProduct } from '@/lib/radar';

export async function saveProductAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer();
  const productId = String(formData.get('produit') ?? '');
  const repo = getRepo();
  const product = await repo.getProduct(productId);
  if (!product || !(await canAccessProduct(profile, productId))) redirect('/app');
  await repo.saveProduct(profile.id, productId, DEFAULT_VIDEO_GOAL);
  revalidatePath(`/app/produit/${productId}`);
  revalidatePath('/app/mes-produits');
  revalidatePath('/app');
}
