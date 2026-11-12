'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { addDays, parisDate } from '@/lib/utils';
import { buildPlan, RHYTHMS, type PlanItemStatus, type PublicationPlan, type Rhythm } from '@/lib/v2/planning';

async function viewer() {
  const { profile } = await requireOnboardedViewer('/app/plan');
  if (!getPlan(profile.plan).planning) redirect('/app/passer-pro');
  return profile;
}

export async function createPlanAction(formData: FormData) {
  const profile = await viewer();
  const repo = getRepo();
  const productId = String(formData.get('produit') ?? '');
  const rhythm = Number(formData.get('rythme')) as Rhythm;
  const saved = await repo.getSavedProduct(profile.id, productId);
  const product = saved ? await repo.getProduct(productId) : null;
  if (!product || !RHYTHMS.includes(rhythm)) redirect('/app/plan?erreur=produit');
  const existing = (await repo.listRecords<PublicationPlan>(profile.id, 'publication')).find((r) => r.data.product_id === productId);
  const plan = buildPlan({ productId, productName: product.name, rhythm, start: addDays(parisDate(), 1) });
  await repo.saveRecord(profile.id, 'publication', plan, existing?.id);
  revalidatePath('/app/plan');
  redirect('/app/plan?ok=cree');
}

export async function setPlanItemAction(formData: FormData) {
  const profile = await viewer();
  const repo = getRepo();
  const record = await repo.getRecord<PublicationPlan>(profile.id, String(formData.get('plan') ?? ''));
  const n = Number(formData.get('n'));
  const status = String(formData.get('statut') ?? '') as PlanItemStatus;
  if (!record || !['a_tourner', 'tourne', 'poste'].includes(status)) redirect('/app/plan');
  const items = record.data.items.map((item) => (item.n === n ? { ...item, status } : item));
  await repo.saveRecord(profile.id, 'publication', { ...record.data, items }, record.id);
  // Le compteur « vidéos postées » de Mes produits suit le plan.
  const saved = await repo.getSavedProduct(profile.id, record.data.product_id);
  if (saved) await repo.updateSavedProduct(profile.id, record.data.product_id, { videos_posted: items.filter((i) => i.status === 'poste').length });
  revalidatePath('/app/plan');
  revalidatePath('/app/mes-produits');
  redirect(`/app/plan#plan-${record.id}`);
}

export async function deletePlanAction(formData: FormData) {
  const profile = await viewer();
  await getRepo().deleteRecord(profile.id, String(formData.get('plan') ?? ''));
  revalidatePath('/app/plan');
  redirect('/app/plan');
}
