import type { Hook, VideoScript } from '@/lib/db/types';
import { DEFAULT_SETTINGS, DISCLOSURE_LINE, durationBounds, formatLabel, type Duration } from './formats';
import { findIssues, isClean, stripIssues } from './guard';
import { defaultBroll, generateMockScripts, hookSeconds, regenerateMockHook } from './mock-scripts';
import { getScriptModel, ModelRefusalError, type ScriptModel } from './providers';
import type { Generation } from './schema';
import type { ScriptInput, ScriptOutput, StudioScript } from './types';

/**
 * Génération des scripts vidéo, indépendante du fournisseur d'IA.
 * - AI_PROVIDER=openai (OPENAI_API_KEY, OPENAI_MODEL) ou anthropic (ANTHROPIC_API_KEY, ANTHROPIC_MODEL) :
 *   sortie JSON imposée par le schéma Zod, validée, puis vérifiée par les règles métier et la liste des
 *   interdits (lib/ai/guard.ts) ; un seul nouvel essai si la réponse est invalide ou enfreint les règles.
 * - Sans clé : générateur simulé, mêmes formats de sortie.
 * La ligne de rappel « #publicité » est toujours ajoutée côté serveur.
 */

export class ScriptGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptGenerationError';
  }
}

export interface GenerationResult extends ScriptOutput {
  source: 'claude' | 'openai' | 'simulation';
  /** Nombre d'appels au fournisseur (1, ou 2 après un nouvel essai). 0 en simulation. */
  attempts: number;
  /** Problèmes relevés sur la première réponse, qui ont déclenché le nouvel essai. */
  firstProblems: string[];
}

/** Vérifie les règles métier que le schéma JSON ne peut pas garantir. Renvoie la liste des problèmes. */
export function validateGeneration(output: Generation, target: Duration = 30): string[] {
  const problems: string[] = [];
  const [min, max] = durationBounds(target).accept;
  if (output.hooks.length < 10) problems.push(`10 accroches attendues, ${output.hooks.length} reçues`);
  if (output.scripts.length < 3) problems.push(`3 scripts attendus, ${output.scripts.length} reçus`);
  for (const hook of output.hooks) {
    if (hook.text.trim().split(/\s+/).length > 12) problems.push(`accroche trop longue : « ${hook.text} »`);
    for (const issue of findIssues(hook.text)) problems.push(`${issue.reason} : « ${hook.text} »`);
  }
  output.scripts.forEach((script, i) => {
    if (script.shots.length < 3) problems.push(`script ${i + 1} : trop peu de plans`);
    if (script.duration_seconds < min || script.duration_seconds > max) {
      problems.push(`script ${i + 1} : durée ${script.duration_seconds} s hors de ${min}–${max} s (cible ${target} s)`);
    }
    const texts = [script.caption, script.call_to_action, ...script.shots.flatMap((s) => [s.voice, s.on_screen_text]), ...(script.broll ?? [])];
    for (const text of texts) for (const issue of findIssues(text)) problems.push(`script ${i + 1}, ${issue.reason} : « ${text} »`);
  });
  return problems;
}

/** Normalise la sortie : 10 accroches, 3 scripts, durées bornées, hashtags propres, rappel #publicité. */
function finalize(output: Generation, input: ScriptInput): ScriptOutput {
  const fallback = generateMockScripts(input);
  const [low, high] = durationBounds((input.settings ?? DEFAULT_SETTINGS).duration).clamp;
  const hooks: Hook[] = output.hooks
    .filter((h) => isClean(h.text) && h.text.trim())
    .slice(0, 10)
    .map((h) => ({ text: h.text.trim(), seconds: Math.min(2.9, h.seconds > 0 ? Math.round(h.seconds * 10) / 10 : hookSeconds(h.text)) }));
  for (const h of fallback.hooks) {
    if (hooks.length >= 10) break;
    if (!hooks.some((x) => x.text === h.text)) hooks.push(h);
  }
  const scripts: StudioScript[] = output.scripts.slice(0, 3).map((s) => ({
    title: s.title.trim(),
    angle: s.angle.trim(),
    duration_seconds: Math.min(high, Math.max(low, Math.round(s.duration_seconds))),
    shots: s.shots.map((shot) => ({
      time: shot.time.trim(),
      visual: shot.visual.trim(),
      voice: stripIssues(shot.voice.trim()),
      on_screen_text: stripIssues(shot.on_screen_text.trim()),
    })),
    call_to_action: stripIssues(s.call_to_action.trim()) || 'C’est dans le panier orange, juste en dessous.',
    caption: stripIssues(s.caption.trim()),
    hashtags: s.hashtags
      .map((t) => `#${t.replace(/^#+/, '').replace(/\s+/g, '')}`)
      .filter((t) => t.length > 1)
      .slice(0, 5),
    disclosure: DISCLOSURE_LINE,
    broll: cleanBroll(s.broll, input),
  }));
  while (scripts.length < 3) scripts.push(fallback.scripts[scripts.length]);
  return { hooks, scripts };
}

/** Plans de coupe : ceux de l'IA s'ils sont propres (4 au plus), sinon ceux du format. */
function cleanBroll(broll: string[] | null | undefined, input: ScriptInput): string[] {
  const kept = (broll ?? []).map((b) => b.trim()).filter((b) => b && isClean(b)).slice(0, 4);
  return kept.length >= 2 ? kept : defaultBroll(input.format);
}

function errorMessage(model: ScriptModel, error: unknown): ScriptGenerationError {
  if (error instanceof ScriptGenerationError) return error;
  if (error instanceof ModelRefusalError) return new ScriptGenerationError(error.message);
  return new ScriptGenerationError(model.describeError(error));
}

/** Génère 10 accroches et 3 scripts. Un seul nouvel essai si la sortie est invalide ou enfreint les règles. */
export async function generateScripts(input: ScriptInput, model: ScriptModel | null = getScriptModel()): Promise<GenerationResult> {
  if (!model) {
    // Variante tirée au hasard : deux générations simulées du même produit ne sont pas identiques.
    return { ...generateMockScripts(input, Math.floor(Math.random() * 1_000_000)), source: 'simulation', attempts: 0, firstProblems: [] };
  }
  try {
    let attempts = 1;
    let output: Generation | null = await model.generate(input);
    const target = (input.settings ?? DEFAULT_SETTINGS).duration;
    let problems = output ? validateGeneration(output, target) : ['JSON invalide ou incomplet'];
    const firstProblems = problems;
    if (problems.length) {
      attempts = 2;
      output = await model.generate(input, problems.slice(0, 6).join(' ; '));
      problems = output ? validateGeneration(output, target) : ['JSON invalide ou incomplet'];
    }
    if (!output || output.hooks.length === 0 || output.scripts.length === 0) {
      throw new ScriptGenerationError('Les scripts reçus étaient incomplets, même après un nouvel essai. Réessaie.');
    }
    // Après le nouvel essai, les phrases encore fautives sont retirées et les manques complétés.
    return { ...finalize(output, input), source: model.source, attempts, firstProblems };
  } catch (error) {
    throw errorMessage(model, error);
  }
}

/** Remplace une accroche par une nouvelle, différente des existantes. */
export async function regenerateHook(
  input: ScriptInput,
  existing: string[],
  attempt: number,
  model: ScriptModel | null = getScriptModel(),
): Promise<Hook> {
  if (!model) return regenerateMockHook(input, existing, attempt, String(Math.random()));
  try {
    for (let i = 0; i < 2; i++) {
      const hook = await model.hook(input, existing);
      if (hook && isClean(hook.text) && !existing.includes(hook.text.trim())) {
        return { text: hook.text.trim(), seconds: Math.min(2.9, hook.seconds || hookSeconds(hook.text)) };
      }
    }
    return regenerateMockHook(input, existing, attempt);
  } catch (error) {
    throw errorMessage(model, error);
  }
}

/** Version texte d'une génération, pour copier ou exporter. */
export function scriptsToText(productName: string, format: string, hooks: Hook[], scripts: VideoScript[]): string {
  const out: string[] = [`${productName} · ${formatLabel(format)}`, '', 'ACCROCHES'];
  hooks.forEach((h, i) => out.push(`${i + 1}. ${h.text}`));
  scripts.forEach((s, i) => {
    out.push('', `SCRIPT ${i + 1} : ${s.title} (${s.duration_seconds} s)`, s.angle);
    for (const shot of s.shots) {
      out.push(`[${shot.time}] ${shot.visual}`, `  Voix : ${shot.voice}`, `  Écran : ${shot.on_screen_text}`);
    }
    const broll = (s as Partial<StudioScript>).broll ?? [];
    if (broll.length) out.push(`Plans de coupe : ${broll.join(' · ')}`);
    out.push(`Appel à l’action : ${s.call_to_action}`, `Légende : ${s.caption} ${s.hashtags.join(' ')}`, s.disclosure);
  });
  return out.join('\n');
}

export function scriptToText(script: VideoScript): string {
  const out = [`${script.title} (${script.duration_seconds} s)`];
  for (const shot of script.shots) out.push(`[${shot.time}] ${shot.visual}`, `Voix : ${shot.voice}`, `Écran : ${shot.on_screen_text}`, '');
  const broll = (script as Partial<StudioScript>).broll ?? [];
  if (broll.length) out.push(`Plans de coupe : ${broll.join(' · ')}`);
  out.push(`Appel à l’action : ${script.call_to_action}`, `Légende : ${script.caption} ${script.hashtags.join(' ')}`, script.disclosure);
  return out.join('\n');
}
