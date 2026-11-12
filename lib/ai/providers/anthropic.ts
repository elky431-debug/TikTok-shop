import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '@/lib/env';
import { buildHookPrompt, buildUserPrompt, SYSTEM_PROMPT } from '../prompt';
import { GenerationSchema, SingleHookSchema } from '../schema';
import type { ScriptInput } from '../types';
import { ModelRefusalError, withCorrection, type ScriptModel } from './types';

/** Claude (SDK officiel @anthropic-ai/sdk), sortie JSON imposée par `output_config.format` et validée par Zod. */
export class AnthropicScriptModel implements ScriptModel {
  readonly name = 'anthropic' as const;
  readonly source = 'claude' as const;
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    this.client ??= new Anthropic({ apiKey: env.anthropicKey, maxRetries: 2, timeout: 90_000 });
    return this.client;
  }

  async generate(input: ScriptInput, correction?: string) {
    const response = await this.getClient().messages.parse({
      model: env.anthropicModel,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: withCorrection(buildUserPrompt(input), correction) }],
      output_config: { effort: 'medium', format: zodOutputFormat(GenerationSchema) },
    });
    if (response.stop_reason === 'refusal') throw new ModelRefusalError();
    return response.parsed_output ?? null;
  }

  async hook(input: ScriptInput, existing: string[]) {
    const response = await this.getClient().messages.parse({
      model: env.anthropicModel,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildHookPrompt(input, existing) }],
      output_config: { effort: 'low', format: zodOutputFormat(SingleHookSchema) },
    });
    return response.parsed_output?.hook ?? null;
  }

  describeError(error: unknown): string {
    if (error instanceof Anthropic.AuthenticationError) return 'La clé ANTHROPIC_API_KEY est refusée : vérifie-la dans les réglages.';
    if (error instanceof Anthropic.RateLimitError) return 'Le service d’écriture est très sollicité. Réessaie dans une minute.';
    if (error instanceof Anthropic.NotFoundError) return `Le modèle « ${env.anthropicModel} » est introuvable : vérifie ANTHROPIC_MODEL.`;
    if (error instanceof Anthropic.APIConnectionError) return 'Impossible de joindre le service d’écriture. Vérifie la connexion et réessaie.';
    if (error instanceof Anthropic.APIError) return `Le service d’écriture a renvoyé une erreur (${error.status ?? 'inconnue'}). Réessaie.`;
    return 'L’écriture des scripts a échoué. Réessaie.';
  }
}
