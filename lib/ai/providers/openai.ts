import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { env } from '@/lib/env';
import { buildHookPrompt, buildUserPrompt, SYSTEM_PROMPT } from '../prompt';
import { GenerationSchema, SingleHookSchema } from '../schema';
import type { ScriptInput } from '../types';
import { ModelRefusalError, withCorrection, type ScriptModel } from './types';

/**
 * OpenAI (SDK officiel `openai`, Responses API). Documentation lue : README du paquet 7.55.0, exemple officiel
 * `examples/responses/structured-outputs.ts` et types du paquet :
 *  - `client.responses.parse({ model, instructions, input, text: { format: zodTextFormat(Schéma, 'nom') } })`
 *    impose un JSON Schema strict tiré du schéma Zod et remplit `output_parsed` ;
 *  - si le JSON reçu ne passe pas le schéma, le SDK lève l'erreur de Zod : on la traite comme une sortie invalide
 *    (nouvel essai), jamais comme une panne ;
 *  - une réponse incomplète (`status: 'incomplete'`, par exemple plafond de jetons) n'est pas analysée :
 *    `output_parsed` vaut null ;
 *  - un refus arrive comme un contenu `type: 'refusal'` dans le message de sortie.
 * `store: false` : la demande (prénom, phrase d'exemple) n'est pas conservée dans l'historique OpenAI.
 * Modèle : OPENAI_MODEL, par défaut gpt-6-luna (le moins cher des modèles en service avec sorties structurées).
 */
const KEY_PROBLEM_MESSAGE =
  'L’écriture des scripts est indisponible : la clé OPENAI_API_KEY du serveur n’est pas une vraie clé OpenAI (elle doit commencer par sk-). Remplace-la dans les variables d’environnement, puis redéploie.';

export class OpenAIScriptModel implements ScriptModel {
  readonly name = 'openai' as const;
  readonly source = 'openai' as const;
  private client: OpenAI | null = null;

  /** Jetons consommés depuis la création (pour mesurer le coût réel, par exemple dans npm run ai:sample). */
  readonly usage = { calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };

  constructor(private readonly options: { fetch?: typeof fetch } = {}) {}

  private getClient(): OpenAI {
    this.client ??= new OpenAI({ apiKey: env.openaiKey, maxRetries: 2, timeout: 120_000, fetch: this.options.fetch });
    return this.client;
  }

  /** Appelle l'API ; un JSON illisible ou hors schéma (erreur de Zod ou de JSON.parse) donne null, pas une panne. */
  private async call<R extends { output: OpenAI.Responses.ResponseOutputItem[]; usage?: OpenAI.Responses.ResponseUsage }>(
    request: () => Promise<R>,
  ): Promise<R | null> {
    let response: R;
    try {
      response = await request();
    } catch (error) {
      if (error instanceof Error && !(error instanceof OpenAI.APIError) && (error.name === 'ZodError' || error instanceof SyntaxError)) {
        return null;
      }
      throw error;
    }
    this.usage.calls++;
    this.usage.inputTokens += response.usage?.input_tokens ?? 0;
    this.usage.outputTokens += response.usage?.output_tokens ?? 0;
    this.usage.reasoningTokens += response.usage?.output_tokens_details?.reasoning_tokens ?? 0;
    const refused = response.output.some(
      (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'),
    );
    if (refused) throw new ModelRefusalError();
    return response;
  }

  async generate(input: ScriptInput, correction?: string) {
    const response = await this.call(() =>
      this.getClient().responses.parse({
        model: env.openaiModel,
        instructions: SYSTEM_PROMPT,
        input: withCorrection(buildUserPrompt(input), correction),
        max_output_tokens: 16_000,
        store: false,
        text: { format: zodTextFormat(GenerationSchema, 'scripts_video') },
      }),
    );
    return response?.output_parsed ?? null;
  }

  async hook(input: ScriptInput, existing: string[]) {
    const response = await this.call(() =>
      this.getClient().responses.parse({
        model: env.openaiModel,
        instructions: SYSTEM_PROMPT,
        input: buildHookPrompt(input, existing),
        max_output_tokens: 4_000,
        store: false,
        text: { format: zodTextFormat(SingleHookSchema, 'accroche') },
      }),
    );
    return response?.output_parsed?.hook ?? null;
  }

  describeError(error: unknown): string {
    if (error instanceof OpenAI.AuthenticationError) return env.aiKeyProblem ? KEY_PROBLEM_MESSAGE : 'La clé OPENAI_API_KEY est refusée : vérifie-la dans les réglages.';
    if (error instanceof OpenAI.PermissionDeniedError) return 'Ce compte OpenAI n’a pas accès à ce modèle ou à ce service : vérifie OPENAI_MODEL.';
    if (error instanceof OpenAI.RateLimitError) return 'Le service d’écriture est très sollicité (ou le crédit OpenAI est épuisé). Réessaie dans une minute.';
    if (error instanceof OpenAI.NotFoundError) return `Le modèle « ${env.openaiModel} » est introuvable : vérifie OPENAI_MODEL.`;
    if (error instanceof OpenAI.BadRequestError) {
      // Indices sans secret dans les journaux : hôte appelé et identifiant de requête OpenAI.
      console.error('[openai] demande refusée', error.status, error.param, error.code, error.requestID, error.message);
      // Cause vue en production : un texte d'exemple collé à la place de la clé (OpenAI répond alors 400, pas 401).
      if (env.aiKeyProblem) return KEY_PROBLEM_MESSAGE;
      // Détail renvoyé par l'API (paramètre et code, jamais la clé ni la demande) : la cause exacte se lit à l'écran.
      const apiMessage = String((error.error as { message?: string } | undefined)?.message ?? error.message ?? '')
        .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-…')
        .slice(0, 160);
      const detail = [
        error.param ? `paramètre « ${error.param} »` : null,
        error.code ? `code ${error.code}` : null,
        !error.param && !error.code && apiMessage ? `« ${apiMessage} »` : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `Le modèle « ${env.openaiModel} » a refusé la demande${detail ? ` (${detail})` : ''}. Réessaie, ou vérifie OPENAI_MODEL.`;
    }
    if (error instanceof OpenAI.APIConnectionError) return 'Impossible de joindre le service d’écriture. Vérifie la connexion et réessaie.';
    if (error instanceof OpenAI.APIError) return `Le service d’écriture a renvoyé une erreur (${error.status ?? 'inconnue'}). Réessaie.`;
    return 'L’écriture des scripts a échoué. Réessaie.';
  }
}
