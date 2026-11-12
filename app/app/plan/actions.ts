'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { addDays, parisDate } from '@/lib/utils';
import { ensureBoard, saveBoard, BOARD_KIND } from '@/lib/v2/board';
import { parseDate } from '@/lib/v2/earnings';
import { isRhythm, schedulePlan, unschedulePlan, type PublicationPlan } from '@/lib/v2/planning';

async function viewer() {
  const { profile } = await requireOnboardedViewer('/app/plan');
  if (!getPlan(profile.plan).planning) redirect('/app/passer-pro');
  return profile;
}

function refresh(productId: string) {
  revalidatePath('/app/plan');
  revalidatePath('/app/mes-produits');
  revalidatePath(`/app/mes-produits/${encodeURIComponent(productId)}`);
}

/** Répartit les vidéos pas encore postées d'un produit suivi selon le rythme, à partir du jour choisi (demain par défaut). */
export async function createPlanAction(formData: FormData) {
  const profile = await viewer();
  const repo = getRepo();
  const productId = String(formData.get('produit') ?? '');
  const rhythm = Number(formData.get('rythme'));
  const saved = await repo.getSavedProduct(profile.id, productId);
  const product = saved ? await repo.getProduct(productId) : null;
  if (!saved || !product || !isRhythm(rhythm)) redirect('/app/plan?erreur=produit');
  const today = parisDate();
  const wanted = parseDate(String(formData.get('debut') ?? ''));
  const start = wanted && wanted >= today && wanted <= addDays(today, 365) ? wanted : addDays(today, 1);
  const record = await ensureBoard(repo, profile.id, saved, product);
  await saveBoard(repo, profile.id, record, schedulePlan(record.data, rhythm, start));
  refresh(productId);
  redirect(`/app/plan?ok=cree&mois=${start.slice(0, 7)}`);
}

/** Retire le calendrier d'un produit (le tableau et les vidéos postées restent). */
export async function unschedulePlanAction(formData: FormData) {
  const profile = await viewer();
  const repo = getRepo();
  const record = await repo.getRecord<PublicationPlan>(profile.id, String(formData.get('plan') ?? ''));
  if (!record || record.kind !== BOARD_KIND) redirect('/app/plan');
  await saveBoard(repo, profile.id, record, unschedulePlan(record.data));
  refresh(record.data.product_id);
  redirect('/app/plan?ok=retire');
}
