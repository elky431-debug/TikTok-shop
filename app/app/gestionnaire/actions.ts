'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { ensureBoard, saveBoard } from '@/lib/v2/board';
import { parseDate } from '@/lib/v2/earnings';
import { noteSampleOnLaunch, setProductStage } from '@/lib/v2/launch-store';
import { isPipelineStatus, SAMPLE_KIND, type PipelineStatus, type ProductStage, type SampleData } from '@/lib/v2/manager';
import { moveItem, safeUrl, setPostedDetails } from '@/lib/v2/planning';
import { displayName } from '@/lib/product-name';
import { parisDate } from '@/lib/utils';

/**
 * Actions du gestionnaire (statut des produits, échantillons, vidéos). Chaque action revient sur l'onglet d'où elle
 * part, avec le produit filtré s'il y en avait un.
 */
async function viewer() {
  const { profile } = await requireOnboardedViewer('/app');
  return { profile, repo: getRepo() };
}

function back(formData: FormData, onglet: string, query: string): never {
  const params = new URLSearchParams({ onglet });
  const filtre = String(formData.get('filtre') ?? '');
  if (filtre) params.set('produit', filtre);
  revalidatePath('/app/mes-produits');
  revalidatePath('/app');
  redirect(`/app?${params}&${query}#gestion`);
}

async function followed(userId: string, productId: string) {
  const repo = getRepo();
  const saved = productId ? await repo.getSavedProduct(userId, productId) : null;
  const product = saved ? await repo.getProduct(productId) : null;
  return saved && product ? { saved, product } : null;
}

/** Avancement automatique du statut (vers l'avant seulement, comme les étapes du parcours de lancement). */
function advance(userId: string, productId: string, status: PipelineStatus) {
  return setProductStage(getRepo(), userId, productId, status, 'auto', parisDate());
}

/** Statut d'un produit choisi à la main (menu déroulant du tableau « Produits en cours »). */
export async function setStageAction(formData: FormData) {
  const { profile } = await viewer();
  const productId = String(formData.get('produit') ?? '');
  const status = String(formData.get('statut') ?? '');
  const valid = status === 'a_lancer' || isPipelineStatus(status);
  if (!valid || !(await followed(profile.id, productId))) back(formData, String(formData.get('onglet') ?? 'gestion'), 'erreur=produit');
  await setProductStage(getRepo(), profile.id, productId, status as ProductStage, 'manuel', parisDate());
  revalidatePath('/app/lancer');
  back(formData, String(formData.get('onglet') ?? 'gestion'), 'ok=statut');
}

/** Nouvelle demande d'échantillon : le produit passe à « Échantillon demandé » s'il n'était pas plus loin. */
export async function requestSampleAction(formData: FormData) {
  const { profile, repo } = await viewer();
  const productId = String(formData.get('produit') ?? '');
  const found = await followed(profile.id, productId);
  if (!found) back(formData, 'echantillons', 'erreur=produit');
  const today = parisDate();
  const date = parseDate(String(formData.get('date') ?? '')) ?? today;
  const created = await repo.saveRecord<SampleData>(profile.id, SAMPLE_KIND, {
    product_id: found.product.id,
    product_name: displayName(found.product),
    requested_at: date > today ? today : date,
    received_at: null,
    follow_ups: [],
    note:
      String(formData.get('note') ?? '')
        .trim()
        .slice(0, 300) || null,
  });
  await advance(profile.id, found.product.id, 'echantillon_demande');
  await noteSampleOnLaunch(repo, profile.id, found.product.id, created.id, 'demande');
  back(formData, 'echantillons', 'ok=demande');
}

async function sample(userId: string, id: string) {
  const record = await getRepo().getRecord<SampleData>(userId, id);
  return record?.kind === SAMPLE_KIND ? record : null;
}

export async function followUpSampleAction(formData: FormData) {
  const { profile, repo } = await viewer();
  const record = await sample(profile.id, String(formData.get('id') ?? ''));
  if (!record) back(formData, 'echantillons', 'erreur=echantillon');
  const today = parisDate();
  if (record.data.follow_ups.at(-1) !== today) {
    await repo.saveRecord<SampleData>(profile.id, SAMPLE_KIND, { ...record.data, follow_ups: [...record.data.follow_ups, today].slice(-20) }, record.id);
  }
  back(formData, 'echantillons', 'ok=relance');
}

/** Échantillon reçu : le produit passe à « Échantillon reçu » s'il en était à la demande. */
export async function receiveSampleAction(formData: FormData) {
  const { profile, repo } = await viewer();
  const record = await sample(profile.id, String(formData.get('id') ?? ''));
  if (!record) back(formData, 'echantillons', 'erreur=echantillon');
  await repo.saveRecord<SampleData>(profile.id, SAMPLE_KIND, { ...record.data, received_at: parisDate() }, record.id);
  await advance(profile.id, record.data.product_id, 'echantillon_recu');
  await noteSampleOnLaunch(repo, profile.id, record.data.product_id, record.id, 'recu');
  back(formData, 'echantillons', 'ok=recu');
}

export async function deleteSampleAction(formData: FormData) {
  const { profile, repo } = await viewer();
  const record = await sample(profile.id, String(formData.get('id') ?? ''));
  if (record) await repo.deleteRecord(profile.id, record.id);
  back(formData, 'echantillons', 'ok=suppression');
}

const optionalInt = (value: FormDataEntryValue | null) => {
  const raw = String(value ?? '').replace(/\s/g, '');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 1_000_000_000) : null;
};

/**
 * Vidéo postée, avec son lien, ses vues et ses ventes : la prochaine vidéo du tableau du produit passe en « posté ».
 * Avec `n`, met à jour une vidéo déjà postée.
 */
export async function saveVideoAction(formData: FormData) {
  const { profile, repo } = await viewer();
  const found = await followed(profile.id, String(formData.get('produit') ?? ''));
  if (!found) back(formData, 'videos', 'erreur=produit');
  const rawUrl = String(formData.get('lien') ?? '');
  const url = safeUrl(rawUrl);
  if (rawUrl.trim() && !url) back(formData, 'videos', 'erreur=lien');
  const today = parisDate();
  const date = parseDate(String(formData.get('date') ?? ''));
  const record = await ensureBoard(repo, profile.id, found.saved, found.product);
  let plan = record.data;
  let n = Number(formData.get('n'));
  if (!Number.isInteger(n) || !plan.items.some((i) => i.n === n && i.status === 'poste')) {
    const next = plan.items.find((i) => i.status !== 'poste');
    if (!next) back(formData, 'videos', 'erreur=complet');
    n = next.n;
    plan = moveItem(plan, n, 'poste', today);
  }
  plan = setPostedDetails(plan, n, {
    url,
    posted_at: date && date <= today ? date : (plan.items.find((i) => i.n === n)?.posted_at ?? today),
    views: optionalInt(formData.get('vues')),
    sales: optionalInt(formData.get('ventes')),
  });
  await saveBoard(repo, profile.id, record, plan);
  await advance(profile.id, found.product.id, 'en_ligne');
  back(formData, 'videos', 'ok=video');
}
