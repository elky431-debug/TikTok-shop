'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { NexscopeProvider, type VideoFacts } from '@/lib/data/nexscope';
import { getRepo } from '@/lib/db';
import { env } from '@/lib/env';
import { getPlan } from '@/lib/plans';
import { analyzeVideo, tiktokVideoId, type AnalysisData } from '@/lib/v2/analysis';
import { remainingToday } from '@/lib/v2/quota';

export async function analyzeVideoAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/analyse');
  const plan = getPlan(profile.plan);
  if (!plan.analysesPerDay) redirect('/app/passer-pro');
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
    };
    id = (await repo.saveRecord(profile.id, 'analyse', data)).id;
  } catch (error) {
    console.error('[analyse]', error instanceof Error ? error.message : error);
    redirect('/app/analyse?erreur=ia');
  }
  revalidatePath('/app/analyse');
  redirect(`/app/analyse?analyse=${id}`);
}

export async function deleteAnalysisAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/analyse');
  await getRepo().deleteRecord(profile.id, String(formData.get('id') ?? ''));
  revalidatePath('/app/analyse');
  redirect('/app/analyse');
}
