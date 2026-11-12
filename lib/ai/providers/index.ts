import { env } from '@/lib/env';
import { AnthropicScriptModel } from './anthropic';
import { OpenAIScriptModel } from './openai';
import type { ScriptModel } from './types';

export type { AiProviderName, ScriptModel } from './types';
export { ModelRefusalError } from './types';

let cached: ScriptModel | null = null;
let override: ScriptModel | null = null;

/** Fournisseur d'IA choisi par AI_PROVIDER (openai ou anthropic), null si sa clé manque (générateur simulé). */
export function getScriptModel(): ScriptModel | null {
  if (override) return override;
  const name = env.aiProvider;
  if (!name) return null;
  if (cached?.name !== name) cached = name === 'openai' ? new OpenAIScriptModel() : new AnthropicScriptModel();
  return cached;
}

/** Pour les tests : impose un modèle (null revient au choix par l'environnement). */
export function setScriptModelForTests(model: ScriptModel | null): void {
  override = model;
}
