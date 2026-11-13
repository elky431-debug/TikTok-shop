'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { startTask } from '@/lib/tasks/start';
import { isScriptFormat } from '@/lib/ai/formats';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { isNicheId } from '@/lib/niches';
import { getPlan } from '@/lib/plans';
import { normalizeAnalysis, tiktokVideoId, type AnalysisData } from '@/lib/v2/analysis';
import { remainingThisMonth } from '@/lib/v2/quota';
import { createStudioDraft, studioDraftHref } from '@/lib/v2/studio-draft';

async function viewer() {
  const { profile } = await requireOnboardedViewer('/app/analyse');
  const plan = getPlan(profile.plan);
  if (!plan.analysesPerMonth) redirect('/app/passer-pro');
  return { profile, plan };
}

export async function analyzeVideoAction(formData: FormData) {
  const { profile, plan } = await viewer();
  if ((await remainingThisMonth(profile.id, 'analyse', plan.analysesPerMonth)) <= 0) redirect('/app/analyse?erreur=quota');
  const url = String(formData.get('lien') ?? '').trim();
  const text = String(formData.get('texte') ?? '').trim();
  const videoId = url ? tiktokVideoId(url) : null;
  if (url && !videoId) redirect('/app/analyse?erreur=lien');

  // Sans lien, le texte suffit ; avec un lien, la description de la vidéo peut le compléter dans la tâche.
  if (!videoId && text.length < 20) redirect('/app/analyse?erreur=texte');
  const path = await startTask(
    profile,
    'analyse',
    { lien: url, texte: text.slice(0, 5000), video: videoId, produit: String(formData.get('produit') ?? '') },
    '/app/analyse',
  );
  revalidatePath('/app/analyse');
  redirect(path);
}

/**
 * Envoie la version adaptée au studio : fiche `brouillon_studio` (contrat dans lib/v2/studio-draft.ts), puis ouverture
 * du studio sur le produit choisi. Le texte ne passe jamais dans l'adresse.
 */
export async function sendToStudioAction(formData: FormData) {
  const { profile } = await viewer();
  const repo = getRepo();
  const record = await repo.getRecord<AnalysisData>(profile.id, String(formData.get('id') ?? ''));
  if (!record || record.kind !== 'analyse') redirect('/app/analyse');
  const wanted = String(formData.get('produit') ?? '') || record.data.product_id || '';
  const productId = wanted && (await repo.getSavedProduct(profile.id, wanted)) ? wanted : null;
  if (!productId) redirect(`/app/analyse?analyse=${record.id}&erreur=produit#version`);
  const view = normalizeAnalysis(record.data);
  const draft = await createStudioDraft(repo, profile.id, {
    product_id: productId,
    source: 'analyse',
    source_id: record.id,
    title: view.adapted.title,
    lines: view.adapted.lines.length ? view.adapted.lines : [view.summary || 'Inspiration'],
    format: view.format,
  });
  redirect(studioDraftHref(productId, draft.id));
}

/** Classement de la bibliothèque corrigé à la main (format, niche). */
export async function classifyAnalysisAction(formData: FormData) {
  const { profile } = await viewer();
  const repo = getRepo();
  const record = await repo.getRecord<AnalysisData>(profile.id, String(formData.get('id') ?? ''));
  if (!record || record.kind !== 'analyse') redirect('/app/analyse');
  const format = String(formData.get('format') ?? '');
  const niche = String(formData.get('niche') ?? '');
  await repo.saveRecord<AnalysisData>(
    profile.id,
    'analyse',
    { ...record.data, format: isScriptFormat(format) ? format : null, niche: isNicheId(niche) ? niche : null },
    record.id,
  );
  revalidatePath('/app/analyse');
  redirect(`/app/analyse?analyse=${record.id}&ok=classement#bibliotheque`);
}

export async function deleteAnalysisAction(formData: FormData) {
  const { profile } = await viewer();
  const repo = getRepo();
  const record = await repo.getRecord(profile.id, String(formData.get('id') ?? ''));
  if (record?.kind === 'analyse') await repo.deleteRecord(profile.id, record.id);
  revalidatePath('/app/analyse');
  redirect('/app/analyse');
}
