import { generateScripts, regenerateHook, scriptsToText, ScriptGenerationError } from '@/lib/ai/scripts';
import type { ScriptInput } from '@/lib/ai/types';
import { getRepo } from '@/lib/db';
import type { Product, Profile, ScriptFormat, ScriptRecord } from '@/lib/db/types';
import { ensureCatalog } from '@/lib/jobs/nightly';
import { getPlan, isPaidPlan, MAX_HOOK_REGENERATIONS, remainingScripts, scriptLimitForUsage } from '@/lib/plans';
import { canAccessProduct } from '@/lib/radar';
import { rankForUser, visibleProductIds } from '@/lib/radar-rules';
import { parisDate } from '@/lib/utils';

export type StudioErrorCode = 'limite' | 'acces' | 'produit' | 'generation' | 'regeneration';

export class StudioError extends Error {
  constructor(
    public readonly code: StudioErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StudioError';
  }
}

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

function inputFor(profile: Profile, product: Product, format: ScriptFormat): ScriptInput {
  return {
    product,
    format,
    style: profile.video_style,
    examplePhrase: profile.example_phrase,
    firstName: profile.first_name,
    topVideos: product.top_videos,
  };
}

/**
 * Écrit 10 accroches et 3 scripts. La limite du plan est vérifiée et consommée de façon atomique
 * AVANT l'appel au modèle ; le crédit est rendu si la génération échoue.
 */
export async function createScripts(profile: Profile, productId: string, format: ScriptFormat): Promise<ScriptRecord> {
  const repo = getRepo();
  const product = await repo.getProduct(productId);
  if (!product) throw new StudioError('produit', 'Ce produit n’existe plus. Choisis-en un autre.');
  if (!(await canAccessProduct(profile, productId))) {
    throw new StudioError('acces', 'Ce produit est réservé au plan Pro. Choisis un de tes produits du jour.');
  }

  const day = parisDate();
  const count = await repo.incrementUsage(profile.id, day, scriptLimitForUsage(profile.plan));
  if (count < 0) {
    const plan = getPlan(profile.plan);
    throw new StudioError(
      'limite',
      `Tu as écrit tes ${plan.scriptsPerDay} scripts du jour (plan ${plan.name}). Ton compteur repart à zéro demain matin.`,
    );
  }

  try {
    const result = await generateScripts(inputFor(profile, product, format));
    return await repo.insertScript({
      user_id: profile.id,
      product_id: product.id,
      format,
      hooks: result.hooks,
      script: result.scripts,
      full_text: scriptsToText(product.name, format, result.hooks, result.scripts),
      source: result.source,
      saved: false,
      regen_count: 0,
    });
  } catch (error) {
    await repo.decrementUsage(profile.id, day);
    if (error instanceof ScriptGenerationError) throw new StudioError('generation', error.message);
    throw error;
  }
}

/** Remplace l'accroche n°index (gratuit, dans la limite de 5 par script). */
export async function regenerateHookAt(profile: Profile, scriptId: string, index: number): Promise<ScriptRecord> {
  const repo = getRepo();
  const record = await repo.getScript(profile.id, scriptId);
  if (!record) throw new StudioError('produit', 'Ce script est introuvable.');
  if (index < 0 || index >= record.hooks.length) throw new StudioError('regeneration', 'Accroche introuvable.');
  if (record.regen_count >= MAX_HOOK_REGENERATIONS) {
    throw new StudioError('regeneration', `Tu as déjà régénéré ${MAX_HOOK_REGENERATIONS} accroches sur ce script. Écris de nouveaux scripts pour en avoir d’autres.`);
  }
  const product = await repo.getProduct(record.product_id);
  if (!product) throw new StudioError('produit', 'Ce produit n’existe plus.');
  try {
    const hook = await regenerateHook(
      inputFor(profile, product, record.format),
      record.hooks.map((h) => h.text),
      record.regen_count,
    );
    const hooks = record.hooks.map((h, i) => (i === index ? hook : h));
    return await repo.updateScript(profile.id, scriptId, {
      hooks,
      regen_count: record.regen_count + 1,
      full_text: scriptsToText(product.name, record.format, hooks, record.script),
    });
  } catch (error) {
    if (error instanceof ScriptGenerationError) throw new StudioError('generation', error.message);
    throw error;
  }
}

export async function setScriptSaved(profile: Profile, scriptId: string, saved: boolean): Promise<void> {
  await getRepo().updateScript(profile.id, scriptId, { saved });
}
