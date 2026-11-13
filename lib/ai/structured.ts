import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { env } from '@/lib/env';
import { ModelRefusalError } from './providers/types';

/**
 * Demande à l'IA un objet JSON conforme à un schéma Zod, avec le fournisseur choisi (AI_PROVIDER) et les mêmes
 * mécanismes que le studio (doc officielle de chaque SDK) : OpenAI `responses.parse` + `zodTextFormat` (store: false),
 * Anthropic `messages.parse` + `output_config.format`. Un nouvel essai si la sortie est invalide. Sans clé : la
 * réponse simulée, déterministe, fournie par l'appelant (marquée `simulated`).
 */
export interface StructuredRequest<T> {
  /** Nom court du format (lettres, chiffres, tirets bas). */
  name: string;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Retouche courte, faite pendant le clic : sans raisonnement (OpenAI), pour rester sous la limite de 10 s de Netlify. */
  quick?: boolean;
  simulate: () => T;
}

export interface StructuredResult<T> {
  data: T;
  simulated: boolean;
}

type Runner = <T>(request: StructuredRequest<T>) => Promise<T | null>;
let override: Runner | null = null;

/** Tests : remplace l'appel au fournisseur (null revient au fournisseur configuré). */
export function setStructuredRunnerForTests(runner: Runner | null) {
  override = runner;
}

let openai: OpenAI | null = null;
let anthropic: Anthropic | null = null;

async function runOpenAI<T>(request: StructuredRequest<T>): Promise<T | null> {
  openai ??= new OpenAI({ apiKey: env.openaiKey, maxRetries: 2, timeout: 120_000 });
  try {
    const response = await openai.responses.parse({
      model: env.openaiModel,
      instructions: request.system,
      input: request.prompt,
      max_output_tokens: request.maxTokens ?? 6000,
      store: false,
      ...(request.quick ? { reasoning: { effort: 'none' as const } } : env.openaiReasoningEffort ? { reasoning: { effort: env.openaiReasoningEffort } } : {}),
      text: { format: zodTextFormat(request.schema as never, request.name) },
    });
    if (response.output.some((item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'))) {
      throw new ModelRefusalError();
    }
    return (response.output_parsed as T | null) ?? null;
  } catch (error) {
    if (error instanceof Error && !(error instanceof OpenAI.APIError) && (error.name === 'ZodError' || error instanceof SyntaxError)) return null;
    throw error;
  }
}

async function runAnthropic<T>(request: StructuredRequest<T>): Promise<T | null> {
  anthropic ??= new Anthropic({ apiKey: env.anthropicKey, maxRetries: 2, timeout: 90_000 });
  const response = await anthropic.messages.parse({
    model: env.anthropicModel,
    max_tokens: request.maxTokens ?? 6000,
    system: request.system,
    messages: [{ role: 'user', content: request.prompt }],
    output_config: { format: zodOutputFormat(request.schema as never) },
  });
  if (response.stop_reason === 'refusal') throw new ModelRefusalError();
  return (response.parsed_output as T | null) ?? null;
}

export async function askStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const runner: Runner | null = override ?? (env.aiProvider === 'openai' ? runOpenAI : env.aiProvider === 'anthropic' ? runAnthropic : null);
  if (!runner) return { data: request.simulate(), simulated: true };
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await runner(request);
    const parsed = raw === null ? null : request.schema.safeParse(raw);
    if (parsed?.success) return { data: parsed.data, simulated: false };
  }
  throw new Error('Le service d’écriture a renvoyé une réponse illisible deux fois. Réessaie.');
}
