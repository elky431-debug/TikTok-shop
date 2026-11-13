import { isScriptFormat, parseSettings } from '@/lib/ai/formats';
import { NexscopeProvider, type VideoFacts } from '@/lib/data/nexscope';
import { getRepo, type Repo } from '@/lib/db';
import { env } from '@/lib/env';
import { requestHookAnalysis } from '@/lib/radar/hook-analysis';
import { createScripts, StudioError } from '@/lib/studio';
import { createSeries, writeFromAngle } from '@/lib/studio/series';
import { analyzeAndSaveStyle } from '@/lib/studio/style';
import { analyzeVideo, type AnalysisData } from '@/lib/v2/analysis';
import { extractOffer, scoreOffer, writeReplies, type OfferData } from '@/lib/v2/offers';
import { CONTENT_PLAN_KIND, generateContentPlan, getPreparation, type ContentPlanData } from '@/lib/v2/preparation';
import { readStudioDraft } from '@/lib/v2/studio-draft';
import { executeTask, type TaskHandler, type TaskType } from './index';

/**
 * Le travail long de chaque fonctionnalité d'IA, repris des actions (qui gardent les vérifications rapides : session,
 * plan, quota). Chaque travail renvoie la page à ouvrir, avec son message en cas d'échec prévu, comme avant.
 */
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const enc = encodeURIComponent;

function studioMessage(error: unknown, fallback: string): string {
  if (error instanceof StudioError) return error.message;
  console.error('[tâches] studio', error instanceof Error ? error.message : error);
  return fallback;
}

export const TASK_HANDLERS: Record<TaskType, TaskHandler> = {
  async studio(profile, input, repo) {
    const productId = str(input.produit);
    const format = input.format;
    if (!isScriptFormat(format)) return `/app/studio?erreur=${enc('Choisis un format de vidéo.')}`;
    try {
      const draft = await readStudioDraft(repo, profile.id, str(input.brouillon) || null);
      const settings = parseSettings((input.reglages ?? {}) as Record<string, unknown>);
      return `/app/studio/${(await createScripts(profile, productId, format, { settings, draft })).id}`;
    } catch (error) {
      return `/app/studio?produit=${enc(productId)}&erreur=${enc(studioMessage(error, 'L’écriture des scripts a échoué. Réessaie dans un instant.'))}`;
    }
  },

  async serie(profile, input) {
    try {
      return `/app/studio/serie/${(await createSeries(profile, str(input.produit))).id}`;
    } catch (error) {
      return `/app/studio/serie?erreur=${enc(studioMessage(error, 'La série n’a pas pu être créée. Réessaie dans un instant.'))}`;
    }
  },

  async angle(profile, input) {
    const seriesId = str(input.serie);
    const index = Number(input.angle);
    try {
      return `/app/studio/${(await writeFromAngle(profile, seriesId, index)).id}`;
    } catch (error) {
      return `/app/studio/serie/${seriesId}?erreur=${enc(studioMessage(error, 'Les scripts n’ont pas pu être écrits. Réessaie dans un instant.'))}&angle=${index}#angle-${index + 1}`;
    }
  },

  async style(profile, input) {
    const samples = Array.isArray(input.textes) ? input.textes.map((v) => String(v)) : [];
    try {
      await analyzeAndSaveStyle(profile, samples);
      return '/app/studio/style?ok=analyse';
    } catch (error) {
      return `/app/studio/style?erreur=${enc(studioMessage(error, 'Ton style n’a pas pu être analysé. Réessaie dans un instant.'))}`;
    }
  },

  async analyse(profile, input, repo) {
    const url = str(input.lien);
    let text = str(input.texte);
    const videoId = str(input.video) || null;
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
    if (text.length < 20) return `/app/analyse?erreur=${videoId ? 'sans-texte' : 'texte'}`;
    const productId = str(input.produit);
    const product = productId && (await repo.getSavedProduct(profile.id, productId)) ? await repo.getProduct(productId) : null;
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
      return `/app/analyse?analyse=${(await repo.saveRecord(profile.id, 'analyse', data)).id}`;
    } catch (error) {
      console.error('[analyse]', error instanceof Error ? error.message : error);
      return '/app/analyse?erreur=ia';
    }
  },

  async offre(profile, input, repo) {
    const text = str(input.message);
    try {
      const extracted = await extractOffer(text);
      const radar = await repo.listProducts(extracted.data.niche ? { niches: [extracted.data.niche] } : {});
      const score = scoreOffer(extracted.data, radar);
      const replies = await writeReplies(extracted.data, score, profile.first_name);
      const data: OfferData = {
        text: text.slice(0, 6000),
        extracted: extracted.data,
        score,
        replies: replies.data,
        status: 'nouvelle',
        simulated: extracted.simulated || replies.simulated,
        follow_up_on: null,
        follow_up_sent: null,
      };
      return `/app/offres?offre=${(await repo.saveRecord(profile.id, 'offre', data)).id}`;
    } catch (error) {
      console.error('[propositions]', error instanceof Error ? error.message : error);
      return '/app/offres?erreur=ia';
    }
  },

  async preparation(profile, _input, repo) {
    const prep = await getPreparation(repo, profile.id);
    if (!prep.data.niche) return '/app/preparation?erreur=niche#niche';
    try {
      const result = await generateContentPlan(prep.data.niche, profile, prep.data.tastes.about);
      await repo.saveRecord<ContentPlanData>(profile.id, CONTENT_PLAN_KIND, {
        niche: prep.data.niche,
        plan: result.plan,
        simulated: result.simulated,
        created_at: new Date().toISOString(),
      });
      return '/app/preparation?ok=plan#plan';
    } catch (error) {
      console.error('[préparation] plan', error instanceof Error ? error.message : error);
      return '/app/preparation?erreur=ia#plan';
    }
  },

  async accroches(profile, input, repo) {
    const productId = str(input.produit);
    const back = `/app/produit/${enc(productId)}`;
    const product = await repo.getProduct(productId);
    if (!product) return '/app/radar';
    const result = await requestHookAnalysis(profile, product);
    if (!result.ok) return result.reason === 'plan' ? '/app/passer-pro' : `${back}?accroches=${result.reason}#accroches`;
    return `${back}#accroches`;
  },
};

/** Exécute une tâche (fonction d'arrière-plan, ou directement en local). */
export function runTask(userId: string, taskId: string, repo: Repo = getRepo()) {
  return executeTask(userId, taskId, TASK_HANDLERS, repo);
}
