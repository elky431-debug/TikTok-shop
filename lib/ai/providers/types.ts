import type { Generation } from '../schema';
import type { ScriptInput } from '../types';

export type AiProviderName = 'anthropic' | 'openai';

/** Ce qu'un fournisseur d'IA doit savoir faire pour le studio. Le reste (validation, nouvel essai, garde-fou, mise
 * en forme) est commun et vit dans lib/ai/scripts.ts. */
export interface ScriptModel {
  readonly name: AiProviderName;
  /** Valeur enregistrée dans `scripts.source`. */
  readonly source: 'claude' | 'openai';
  /** 10 accroches + 3 scripts. null = sortie invalide (JSON illisible ou hors schéma, réponse incomplète). */
  generate(input: ScriptInput, correction?: string): Promise<Generation | null>;
  /** Une nouvelle accroche. null = sortie invalide. */
  hook(input: ScriptInput, existing: string[]): Promise<{ text: string; seconds: number } | null>;
  /** Message en français pour l'utilisateur, à partir d'une erreur de l'API (jamais la clé ni la réponse brute). */
  describeError(error: unknown): string;
}

/** Le fournisseur a refusé de traiter la demande (contenu jugé sensible) : inutile de réessayer. */
export class ModelRefusalError extends Error {
  constructor() {
    super('Ce produit n’a pas pu être traité par le service d’écriture. Essaie un autre format ou un autre produit.');
    this.name = 'ModelRefusalError';
  }
}

/** Consigne ajoutée au message quand la sortie précédente enfreignait les règles. */
export function withCorrection(prompt: string, correction?: string): string {
  return correction
    ? `${prompt}\n\nAttention, ta réponse précédente ne respectait pas les règles : ${correction}. Corrige ces points.`
    : prompt;
}
