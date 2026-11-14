'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { ensureBoard, saveBoard } from '@/lib/v2/board';
import { parseDate } from '@/lib/v2/earnings';
import { isPipelineStatus, SAMPLE_KIND, TRACK_KIND, withStatus, type PipelineStatus, type ProductTrack, type SampleData } from '@/lib/v2/manager';
import { moveItem, safeUrl, setPostedDetails } from '@/lib/v2/planning';
import { displayName } from '@/lib/product-name';
import { parisDate } from '@/lib/utils';

/**
 * Actions du gestionnaire (statut des produits, échantillons, vidéos). Chaque action revient sur l'onglet d'où elle
 * part, avec le produit filtré s'il y en avait un.
 */
async function viewer() {
  const { profile } = await requireOnboardedViewer('/app/gestionnaire');
  return { profile, repo: getRepo() };
}

function back(formData: FormData, onglet: string, query: string): never {
  const params = new URLSearchParams({ onglet });
  const filtre = String(formData.get('filtre') ?? '');
  if (filtre) params.set('produit', filtre);
  revalidatePath('/app/gestionnaire');
  revalidatePath('/app/mes-produits');
  revalidatePath('/app');
  redirect(`/app/gestionnaire?${params}&${query}`);
}

async function followed(userId: string, productId: string) {
  const repo = getRepo();
  const saved = productId ? await repo.getSavedProduct(userId, productId) : null;
  const product = saved ? await repo.getProduct(productId) : null;
  return saved && product ? { saved, product } : null;
}

async function setStage(userId: string, productId: string, status: PipelineStatus) {
  const repo = getRepo();
  const records = await repo.listRecords<ProductTrack>(userId, TRACK_KIND);
  const record = records.find((r) => r.data.product_id === productId) ?? null;
  const next = withStatus(record?.data ?? null, productId, status, parisDate());
  if (next !== record?.data) await repo.saveRecord<ProductTrack>(userId, TRACK_KIND, next, record?.id);
}

/** Statut d'un produit (pastille cliquable ou choix dans la liste). */
export async function setStageAction(formData: FormData) {
  const { profile } = await viewer();
  const productId = String(formData.get('produit') ?? '');
  const status = String(formData.get('statut') ?? '');
  if (!isPipelineStatus(status) || !(await followed(profile.id, productId))) back(formData, String(formData.get('onglet') ?? 'gestion'), 'erreur=produit');
  await setStage(profile.id, productId, status as PipelineStatus);
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
  await repo.saveRecord<SampleData>(profile.id, SAMPLE_KIND, {
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
  const tracks = await repo.listRecords<ProductTrack>(profile.id, TRACK_KIND);
  const current = tracks.find((t) => t.data.product_id === found.product.id)?.data.status;
  if (!current || current === 'arrete') await setStage(profile.id, found.product.id, 'echantillon_demande');
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
  const tracks = await repo.listRecords<ProductTrack>(profile.id, TRACK_KIND);
  const current = tracks.find((t) => t.data.product_id === record.data.product_id)?.data.status;
  if (!current || current === 'echantillon_demande') await setStage(profile.id, record.data.product_id, 'echantillon_recu');
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
  const tracks = await repo.listRecords<ProductTrack>(profile.id, TRACK_KIND);
  const current = tracks.find((t) => t.data.product_id === found.product.id)?.data.status;
  if (current && current !== 'en_ligne' && current !== 'arrete') await setStage(profile.id, found.product.id, 'en_ligne');
  back(formData, 'videos', 'ok=video');
}
