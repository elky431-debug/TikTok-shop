'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import {
  EARNING_FIELDS,
  EARNINGS_KIND,
  mappingFits,
  MAX_IMPORT_BYTES,
  parseAmount,
  parseDate,
  parseEarningsCsv,
  parseFormat,
  parseNiche,
  PENDING_IMPORT_KIND,
  readCsv,
  attachProducts,
  type CsvMapping,
  type EarningData,
  type PendingImport,
} from '@/lib/v2/earnings';
import { forgetMapping, getMapping, importEarnings, saveMapping, setEarningsGoal } from '@/lib/v2/earnings-store';

async function viewer() {
  const { profile } = await requireOnboardedViewer('/app/gains');
  if (!getPlan(profile.plan).earnings) redirect('/app/passer-pro');
  return profile;
}

const done = (query: string): never => {
  revalidatePath('/app/gains');
  redirect(`/app/gains?${query}`);
};

/** Saisie d'un gain, pour une vidéo ou pour le produit entier. */
export async function addEarningAction(formData: FormData) {
  const profile = await viewer();
  const repo = getRepo();
  const date = parseDate(String(formData.get('date') ?? ''));
  const amount = parseAmount(String(formData.get('montant') ?? ''));
  const product = String(formData.get('produit') ?? '').trim();
  if (!date || amount === null || !product) redirect('/app/gains?erreur=saisie#ajouter');
  const sales = Number(formData.get('ventes'));
  const saved = await repo.listSavedProducts(profile.id);
  const products = await repo.getProducts(saved.map((s) => s.product_id));
  const [data] = attachProducts(
    [
      {
        date,
        product_name: product.slice(0, 200),
        product_id: null,
        video: String(formData.get('video') ?? '').trim().slice(0, 300) || null,
        amount_cents: amount,
        sales: Number.isFinite(sales) && sales > 0 ? Math.round(sales) : null,
        source: 'saisie',
        format: parseFormat(String(formData.get('format') ?? '')),
        niche: parseNiche(String(formData.get('niche') ?? '')),
      } satisfies EarningData,
    ],
    products,
  );
  await repo.saveRecord(profile.id, EARNINGS_KIND, data);
  done('ok=ajout');
}

/**
 * Première étape de l'import : lit le fichier. Si une correspondance des colonnes est mémorisée et s'applique, les
 * lignes sont importées tout de suite ; sinon (première fois, ou « choisir les colonnes à nouveau »), le fichier est
 * mis de côté et l'écran de choix des colonnes s'ouvre.
 */
export async function startImportAction(formData: FormData) {
  const profile = await viewer();
  const repo = getRepo();
  const file = formData.get('fichier');
  const text = file instanceof File && file.size ? await file.text() : String(formData.get('texte') ?? '');
  if (!text.trim()) redirect('/app/gains?erreur=fichier#importer');
  if (text.length > MAX_IMPORT_BYTES) redirect('/app/gains?erreur=taille#importer');
  const table = readCsv(text);
  if (table.headers.length < 2 || !table.rows.length) redirect('/app/gains?erreur=vide#importer');
  const memorized = await getMapping(repo, profile.id);
  if (memorized && formData.get('revoir') !== 'on' && mappingFits(memorized.data.mapping, table.headers)) {
    const result = parseEarningsCsv(text, memorized.data.mapping);
    if (result.rows.length) {
      const { added, duplicates } = await importEarnings(repo, profile.id, result.rows);
      done(`ok=import&lignes=${added}&doublons=${duplicates}&ignorees=${result.errors.length}`);
    }
  }
  // Un seul fichier en attente à la fois.
  for (const old of await repo.listRecords(profile.id, PENDING_IMPORT_KIND)) await repo.deleteRecord(profile.id, old.id);
  const pending = await repo.saveRecord<PendingImport>(profile.id, PENDING_IMPORT_KIND, {
    text,
    file_name: file instanceof File && file.size ? file.name.slice(0, 120) : null,
  });
  redirect(`/app/gains/import?fichier=${pending.id}`);
}

/** Deuxième étape : colonnes choisies par l'utilisateur, import, puis correspondance mémorisée pour la prochaine fois. */
export async function confirmImportAction(formData: FormData) {
  const profile = await viewer();
  const repo = getRepo();
  const id = String(formData.get('fichier') ?? '');
  const pending = await repo.getRecord<PendingImport>(profile.id, id);
  if (!pending || pending.kind !== PENDING_IMPORT_KIND) redirect('/app/gains?erreur=expire#importer');
  const mapping: CsvMapping = {};
  for (const field of EARNING_FIELDS) {
    const column = String(formData.get(`col_${field.key}`) ?? '');
    if (column) mapping[field.key] = column;
  }
  const missing = EARNING_FIELDS.filter((f) => f.required && !mapping[f.key]);
  if (missing.length) redirect(`/app/gains/import?fichier=${id}&erreur=obligatoires`);
  const columns = Object.values(mapping);
  if (new Set(columns).size !== columns.length) redirect(`/app/gains/import?fichier=${id}&erreur=doublon`);
  const result = parseEarningsCsv(pending.data.text, mapping);
  if (!result.rows.length) redirect(`/app/gains/import?fichier=${id}&erreur=aucune`);
  const { added, duplicates } = await importEarnings(repo, profile.id, result.rows);
  await saveMapping(repo, profile.id, mapping, readCsv(pending.data.text).headers);
  await repo.deleteRecord(profile.id, pending.id);
  done(`ok=import&lignes=${added}&doublons=${duplicates}&ignorees=${result.errors.length}&memorise=1`);
}

export async function cancelImportAction(formData: FormData) {
  const profile = await viewer();
  await getRepo().deleteRecord(profile.id, String(formData.get('fichier') ?? ''));
  done('ok=annule');
}

export async function forgetMappingAction() {
  const profile = await viewer();
  await forgetMapping(getRepo(), profile.id);
  done('ok=oubli#importer');
}

export async function setEarningsGoalAction(formData: FormData) {
  const profile = await viewer();
  const raw = String(formData.get('objectif') ?? '').trim();
  const cents = raw ? parseAmount(raw) : 0;
  if (cents === null || cents < 0) redirect('/app/gains?erreur=objectif#objectif-mois');
  await setEarningsGoal(getRepo(), profile.id, cents);
  done('ok=objectif#objectif-mois');
}

export async function deleteEarningAction(formData: FormData) {
  const profile = await viewer();
  const repo = getRepo();
  const record = await repo.getRecord(profile.id, String(formData.get('id') ?? ''));
  if (record?.kind === EARNINGS_KIND) await repo.deleteRecord(profile.id, record.id);
  done('ok=suppression#lignes');
}
