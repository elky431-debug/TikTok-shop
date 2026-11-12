'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isScriptFormat } from '@/lib/ai/formats';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { NexscopeProvider, type VideoFacts } from '@/lib/data/nexscope';
import { getRepo } from '@/lib/db';
import { env } from '@/lib/env';
import { isNicheId } from '@/lib/niches';
import { getPlan } from '@/lib/plans';
import { analyzeVideo, normalizeAnalysis, tiktokVideoId, type AnalysisData } from '@/lib/v2/analysis';
import { remainingToday } from '@/lib/v2/quota';
import { createStudioDraft, studioDraftHref } from '@/lib/v2/studio-draft';

async function viewer() {
  const { profile } = await requireOnboardedViewer('/app/analyse');
  const plan = getPlan(profile.plan);
  if (!plan.analysesPerDay) redirect('/app/passer-pro');
  return { profile, plan };
}

export async function analyzeVideoAction(formData: FormData) {
  const { profile, plan } = await viewer();
  if ((await remainingToday(profile.id, 'analyse', plan.analysesPerDay)) <= 0) redirect('/app/analyse?erreur=quota');
  const url = String(formData.get('lien') ?? '').trim();
  let text = String(formData.get('texte') ?? '').trim();
  const videoId = url ? tiktokVideoId(url) : null;
  if (url && !videoId) redirect('/app/analyse?erreur=lien');

  // Avec un lien et la clé Nexscope : description et chiffres de la vidéo (mis en cache par le client de la source).
  let facts: VideoFacts | null = null;
  if (videoId && env.nexscopeApiKey) {
    try {
      facts = await new NexscopeProvider().fetchVideoDetail(url);
    } catch (error) {
      console.warn('[analyse] Nexscope', error instanceof Error ? error.message : error);
    }
  }
  if (!text && facts?.description) text = facts.description;
  if (text.length < 20) redirect(`/app/analyse?erreur=${videoId ? 'sans-texte' : 'texte'}`);

  const repo = getRepo();
  const productId = String(formData.get('produit') ?? '');
  const product = productId && (await repo.getSavedProduct(profile.id, productId)) ? await repo.getProduct(productId) : null;
  let id: string;
  try {
    const result = await analyzeVideo({ text, facts, product, profile });
    const data: AnalysisData = {
      url: url || null,
      text: text.slice(0, 5000),
      facts,
      product_id: product?.id ?? null,
      product_name: product?.name ?? null,
      analysis: result.data,
      simulated: result.simulated,
      format: result.data.format,
      // La niche du produit choisi prime sur celle devinée dans le texte.
      niche: product?.niche ?? result.data.niche,
    };
    id = (await repo.saveRecord(profile.id, 'analyse', data)).id;
  } catch (error) {
    console.error('[analyse]', error instanceof Error ? error.message : error);
    redirect('/app/analyse?erreur=ia');
  }
  revalidatePath('/app/analyse');
  redirect(`/app/analyse?analyse=${id}`);
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
