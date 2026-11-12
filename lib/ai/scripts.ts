import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Hook, VideoScript } from '@/lib/db/types';
import { env, isAiConfigured } from '@/lib/env';
import { DISCLOSURE_LINE, formatLabel } from './formats';
import { findIssues, isClean, stripIssues } from './guard';
import { generateMockScripts, hookSeconds, regenerateMockHook } from './mock-scripts';
import { buildHookPrompt, buildUserPrompt, SYSTEM_PROMPT } from './prompt';
import { GenerationSchema, SingleHookSchema, type Generation } from './schema';
import type { ScriptInput, ScriptOutput } from './types';

/**
 * Génération des scripts vidéo.
 * - Avec ANTHROPIC_API_KEY : Claude (modèle ANTHROPIC_MODEL), sortie JSON imposée et validée par Zod,
 *   un nouvel essai si la réponse est invalide ou enfreint les règles.
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
  source: 'claude' | 'simulation';
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: env.anthropicKey, maxRetries: 2, timeout: 90_000 });
  return client;
}

/** Vérifie les règles métier que le schéma JSON ne peut pas garantir. Renvoie la liste des problèmes. */
export function validateGeneration(output: Generation): string[] {
  const problems: string[] = [];
  if (output.hooks.length < 10) problems.push(`10 accroches attendues, ${output.hooks.length} reçues`);
  if (output.scripts.length < 3) problems.push(`3 scripts attendus, ${output.scripts.length} reçus`);
  for (const hook of output.hooks) {
    if (hook.text.trim().split(/\s+/).length > 12) problems.push(`accroche trop longue : « ${hook.text} »`);
    for (const issue of findIssues(hook.text)) problems.push(`${issue.reason} : « ${hook.text} »`);
  }
  output.scripts.forEach((script, i) => {
    if (script.shots.length < 3) problems.push(`script ${i + 1} : trop peu de plans`);
    if (script.duration_seconds < 15 || script.duration_seconds > 45) problems.push(`script ${i + 1} : durée ${script.duration_seconds} s hors de 20–40 s`);
    const texts = [script.caption, script.call_to_action, ...script.shots.flatMap((s) => [s.voice, s.on_screen_text])];
    for (const text of texts) for (const issue of findIssues(text)) problems.push(`script ${i + 1}, ${issue.reason} : « ${text} »`);
  });
  return problems;
}

/** Normalise la sortie : 10 accroches, 3 scripts, durées bornées, hashtags propres, rappel #publicité. */
function finalize(output: Generation, input: ScriptInput): ScriptOutput {
  const fallback = generateMockScripts(input);
  const hooks: Hook[] = output.hooks
    .filter((h) => isClean(h.text) && h.text.trim())
    .slice(0, 10)
    .map((h) => ({ text: h.text.trim(), seconds: Math.min(2.9, h.seconds > 0 ? Math.round(h.seconds * 10) / 10 : hookSeconds(h.text)) }));
  for (const h of fallback.hooks) {
    if (hooks.length >= 10) break;
    if (!hooks.some((x) => x.text === h.text)) hooks.push(h);
  }
  const scripts: VideoScript[] = output.scripts.slice(0, 3).map((s) => ({
    title: s.title.trim(),
    angle: s.angle.trim(),
    duration_seconds: Math.min(40, Math.max(20, Math.round(s.duration_seconds))),
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
  }));
  while (scripts.length < 3) scripts.push(fallback.scripts[scripts.length]);
  return { hooks, scripts };
}

function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return 'La clé ANTHROPIC_API_KEY est refusée : vérifie-la dans les réglages.';
  if (error instanceof Anthropic.RateLimitError) return 'Le service d’écriture est très sollicité. Réessaie dans une minute.';
  if (error instanceof Anthropic.NotFoundError) return `Le modèle « ${env.anthropicModel} » est introuvable : vérifie ANTHROPIC_MODEL.`;
  if (error instanceof Anthropic.APIConnectionError) return 'Impossible de joindre le service d’écriture. Vérifie la connexion et réessaie.';
  if (error instanceof Anthropic.APIError) return `Le service d’écriture a renvoyé une erreur (${error.status ?? 'inconnue'}). Réessaie.`;
  return 'L’écriture des scripts a échoué. Réessaie.';
}

async function callClaude(input: ScriptInput, correction?: string): Promise<Generation | null> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: buildUserPrompt(input) }];
  if (correction) {
    messages[0] = {
      role: 'user',
      content: `${buildUserPrompt(input)}\n\nAttention, ta réponse précédente ne respectait pas les règles : ${correction}. Corrige ces points.`,
    };
  }
  const response = await getClient().messages.parse({
    model: env.anthropicModel,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages,
    output_config: { effort: 'medium', format: zodOutputFormat(GenerationSchema) },
  });
  if (response.stop_reason === 'refusal') {
    throw new ScriptGenerationError('Ce produit n’a pas pu être traité par le service d’écriture. Essaie un autre format ou un autre produit.');
  }
  return response.parsed_output ?? null;
}

/** Génère 10 accroches et 3 scripts. Un seul nouvel essai si la sortie est invalide. */
export async function generateScripts(input: ScriptInput): Promise<GenerationResult> {
  if (!isAiConfigured()) {
    // Variante tirée au hasard : deux générations simulées du même produit ne sont pas identiques.
    return { ...generateMockScripts(input, Math.floor(Math.random() * 1_000_000)), source: 'simulation' };
  }
  try {
    let output = await callClaude(input);
    let problems = output ? validateGeneration(output) : ['JSON invalide'];
    if (problems.length) {
      output = await callClaude(input, problems.slice(0, 6).join(' ; '));
      problems = output ? validateGeneration(output) : ['JSON invalide'];
    }
    if (!output || output.hooks.length === 0 || output.scripts.length === 0) {
      throw new ScriptGenerationError('Les scripts reçus étaient incomplets, même après un nouvel essai. Réessaie.');
    }
    // Après le nouvel essai, les phrases encore fautives sont retirées et les manques complétés.
    return { ...finalize(output, input), source: 'claude' };
  } catch (error) {
    if (error instanceof ScriptGenerationError) throw error;
    throw new ScriptGenerationError(describeApiError(error));
  }
}

/** Remplace une accroche par une nouvelle, différente des existantes. */
export async function regenerateHook(input: ScriptInput, existing: string[], attempt: number): Promise<Hook> {
  if (!isAiConfigured()) return regenerateMockHook(input, existing, attempt, String(Math.random()));
  try {
    for (let i = 0; i < 2; i++) {
      const response = await getClient().messages.parse({
        model: env.anthropicModel,
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildHookPrompt(input, existing) }],
        output_config: { effort: 'low', format: zodOutputFormat(SingleHookSchema) },
      });
      const hook = response.parsed_output?.hook;
      if (hook && isClean(hook.text) && !existing.includes(hook.text.trim())) {
        return { text: hook.text.trim(), seconds: Math.min(2.9, hook.seconds || hookSeconds(hook.text)) };
      }
    }
    return regenerateMockHook(input, existing, attempt);
  } catch (error) {
    throw new ScriptGenerationError(describeApiError(error));
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
    out.push(`Appel à l’action : ${s.call_to_action}`, `Légende : ${s.caption} ${s.hashtags.join(' ')}`, s.disclosure);
  });
  return out.join('\n');
}

export function scriptToText(script: VideoScript): string {
  const out = [`${script.title} (${script.duration_seconds} s)`];
  for (const shot of script.shots) out.push(`[${shot.time}] ${shot.visual}`, `Voix : ${shot.voice}`, `Écran : ${shot.on_screen_text}`, '');
  out.push(`Légende : ${script.caption} ${script.hashtags.join(' ')}`, script.disclosure);
  return out.join('\n');
}
