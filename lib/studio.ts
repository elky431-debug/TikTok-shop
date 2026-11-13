import { DEFAULT_SETTINGS, type ScriptSettings, type StudioFormat } from '@/lib/ai/formats';
import { ensureCommercialMention } from '@/lib/ai/guard';
import { generateScripts, regenerateHook, ScriptGenerationError } from '@/lib/ai/scripts';
import type { SeriesAngle } from '@/lib/ai/series';
import type { ScriptInput } from '@/lib/ai/types';
import { getRepo } from '@/lib/db';
import type { Product, Profile } from '@/lib/db/types';
import { ensureCatalog } from '@/lib/jobs/nightly';
import { cheapestPlanWith, getPlan, isPaidPlan, isUnlimited, MAX_HOOK_REGENERATIONS, remainingScripts, scriptLimitForUsage } from '@/lib/plans';
import { allowedFormats } from './studio/limits';
import { canAccessProduct } from '@/lib/radar';
import { rankForUser, visibleProductIds } from '@/lib/radar-rules';
import { parisDate } from '@/lib/utils';
import { aiFailure, StudioError } from './studio/errors';
import { collectFeedback } from './studio/feedback';
import { deleteDoc, getDoc, insertDoc, listDocs, updateDoc } from './studio/store';
import { activeStyle } from './studio/style';
import type { StudioDocView } from './studio/types';
import { draftAsPromptContext, type StudioDraft } from '@/lib/v2/studio-draft';

export { StudioError, type StudioErrorCode } from './studio/errors';
export { allowedFormats, studioRights, type StudioRights } from './studio/limits';
export type { StudioDoc, StudioDocView } from './studio/types';

export interface UsageToday {
  used: number;
  limit: number; // Infinity = illimité
  remaining: number;
}

export async function getUsageToday(profile: Profile): Promise<UsageToday> {
  const used = await getRepo().getUsage(profile.id, parisDate());
  const limit = getPlan(profile.plan).scriptsPerDay;
  return { used, limit, remaining: remainingScripts(profile.plan, used) };
}

/** Produits proposés dans le studio : ceux du jour accessibles au plan, puis « mes produits ». */
export async function listStudioProducts(profile: Profile): Promise<{ today: Product[]; saved: Product[] }> {
  await ensureCatalog();
  const repo = getRepo();
  const [products, savedRows] = await Promise.all([repo.listProducts(), repo.listSavedProducts(profile.id)]);
  const ranked = rankForUser(products, profile.niches);
  const visible = visibleProductIds(ranked, profile.plan);
  const savedIds = new Set(savedRows.map((s) => s.product_id));
  const today = ranked.filter((p) => visible.has(p.id) && !savedIds.has(p.id)).slice(0, isPaidPlan(profile.plan) ? 30 : 3);
  const byId = new Map(products.map((p) => [p.id, p]));
  const saved = savedRows.map((s) => byId.get(s.product_id)).filter((p): p is Product => Boolean(p));
  return { today, saved };
}

/** Réglages de la dernière génération (pour pré-remplir le formulaire et écrire un angle de série en un clic). */
export async function latestSettings(profile: Profile): Promise<ScriptSettings> {
  const [last] = await listDocs(profile.id);
  return last?.settings ?? DEFAULT_SETTINGS;
}

export function buildScriptInput(
  profile: Profile,
  product: Product,
  format: StudioFormat,
  extras: Pick<ScriptInput, 'settings' | 'personalStyle' | 'feedback' | 'seriesAngle' | 'inspiration'> = {},
): ScriptInput {
  return {
    product,
    format,
    style: profile.video_style,
    examplePhrase: profile.example_phrase,
    firstName: profile.first_name,
    topVideos: product.top_videos,
    settings: extras.settings ?? DEFAULT_SETTINGS,
    personalStyle: extras.personalStyle ?? null,
    feedback: extras.feedback ?? null,
    seriesAngle: extras.seriesAngle ?? null,
    inspiration: extras.inspiration ?? null,
  };
}

export interface CreateOptions {
  settings?: ScriptSettings;
  /** Génération demandée depuis un angle d'une série de 20 vidéos. */
  series?: { id: string; index: number; angle: SeriesAngle };
  /** Brouillon envoyé au studio (analyse de vidéo), relu côté serveur ; compte comme une écriture normale. */
  draft?: StudioDraft | null;
}

/**
 * Écrit 10 accroches et 3 scripts complets. La limite du plan est vérifiée et consommée de façon atomique AVANT
 * l'appel au modèle ; le crédit est rendu si la génération échoue. Le style personnel (Pro) et les scripts que
 * l'utilisateur a le mieux notés (ou qui ont vendu) sont donnés au modèle.
 */
export async function createScripts(profile: Profile, productId: string, format: StudioFormat, options: CreateOptions = {}): Promise<StudioDocView> {
  const repo = getRepo();
  const product = await repo.getProduct(productId);
  if (!product) throw new StudioError('produit', 'Ce produit n’existe plus. Choisis-en un autre.');
  if (!(await canAccessProduct(profile, productId))) {
    throw new StudioError('acces', 'Ce produit est réservé aux abonnés. Choisis ton abonnement pour l’ouvrir.');
  }
  // Formats : 5 en Starter, les 8 à partir de Pro (vérifié ici, côté serveur).
  if (!allowedFormats(profile.plan).includes(format)) {
    throw new StudioError('plan', `Ce format est inclus à partir du plan ${cheapestPlanWith((p) => p.scriptFormats > getPlan(profile.plan).scriptFormats).name}.`);
  }

  const day = parisDate();
  const count = await repo.incrementUsage(profile.id, day, scriptLimitForUsage(profile.plan));
  if (count < 0) {
    const plan = getPlan(profile.plan);
    throw new StudioError(
      'limite',
      isUnlimited(profile.plan, 'scriptsPerDay')
        ? 'Limite de sécurité du jour atteinte. Ton compteur repart à zéro demain matin.'
        : `Tu as écrit tes ${plan.scriptsPerDay} scripts du jour (plan ${plan.name}). Ton compteur repart à zéro demain matin.`,
    );
  }

  try {
    const settings = options.settings ?? DEFAULT_SETTINGS;
    const [personalStyle, docs] = await Promise.all([activeStyle(profile), listDocs(profile.id)]);
    const feedback = collectFeedback(docs);
    const result = await generateScripts(
      buildScriptInput(profile, product, format, {
        settings,
        personalStyle,
        feedback,
        seriesAngle: options.series?.angle ?? null,
        inspiration: options.draft ? draftAsPromptContext(options.draft) : null,
      }),
    );
    const scripts = result.scripts.map((s) => ensureCommercialMention(s));
    return await insertDoc(profile.id, {
      product_id: product.id,
      product_name: product.name,
      format,
      settings,
      hooks: result.hooks,
      scripts,
      previous: scripts.map(() => null),
      versions: scripts.map(() => 1),
      translations: scripts.map(() => ({})),
      ratings: scripts.map(() => null),
      saved: false,
      source: result.source,
      personal_style: Boolean(personalStyle),
      feedback_used: feedback.best.length,
      series: options.series ? { id: options.series.id, index: options.series.index } : null,
      regen_count: 0,
      edit_count: 0,
      simulated_edits: 0,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    await repo.decrementUsage(profile.id, day);
    if (error instanceof ScriptGenerationError) throw new StudioError('generation', error.message);
    throw error;
  }
}

/** Une génération de l'utilisateur, ou une erreur claire. */
export async function requireDoc(profile: Profile, id: string): Promise<StudioDocView> {
  const doc = await getDoc(profile.id, id);
  if (!doc) throw new StudioError('produit', 'Ce script est introuvable.');
  return doc;
}

/** Remplace l'accroche n°index (gratuit, dans la limite de 5 par génération). */
export async function regenerateHookAt(profile: Profile, docId: string, index: number): Promise<StudioDocView> {
  const doc = await requireDoc(profile, docId);
  if (index < 0 || index >= doc.hooks.length) throw new StudioError('regeneration', 'Accroche introuvable.');
  if (doc.regen_count >= MAX_HOOK_REGENERATIONS) {
    throw new StudioError('regeneration', `Tu as déjà régénéré ${MAX_HOOK_REGENERATIONS} accroches sur ce script. Écris de nouveaux scripts pour en avoir d’autres.`);
  }
  const product = await getRepo().getProduct(doc.product_id);
  if (!product) throw new StudioError('produit', 'Ce produit n’existe plus.');
  const input = buildScriptInput(profile, product, doc.format, { settings: doc.settings, personalStyle: await activeStyle(profile) });
  let hook;
  try {
    hook = await regenerateHook(input, doc.hooks.map((h) => h.text), doc.regen_count);
  } catch (error) {
    if (error instanceof ScriptGenerationError) throw new StudioError('generation', error.message);
    throw aiFailure(error, 'L’accroche');
  }
  return updateDoc(profile.id, doc, { hooks: doc.hooks.map((h, i) => (i === index ? hook : h)), regen_count: doc.regen_count + 1 });
}

export async function setScriptSaved(profile: Profile, docId: string, saved: boolean): Promise<StudioDocView> {
  const doc = await requireDoc(profile, docId);
  return updateDoc(profile.id, doc, { saved });
}

export async function deleteGeneration(profile: Profile, docId: string): Promise<void> {
  const doc = await getDoc(profile.id, docId);
  if (doc) await deleteDoc(profile.id, doc);
}
