export type StudioErrorCode =
  | 'limite'
  | 'acces'
  | 'produit'
  | 'generation'
  | 'regeneration'
  /** Fonction réservée à un autre plan. */
  | 'plan'
  /** Quota du jour atteint (séries, analyses de style). */
  | 'quota'
  /** Plus de retouches possibles sur cette génération. */
  | 'retouches'
  | 'invalide';

export class StudioError extends Error {
  constructor(
    public readonly code: StudioErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StudioError';
  }
}

/** Message en français pour une panne du service d'écriture (jamais la réponse brute ni la clé). */
export function aiFailure(error: unknown, what = 'Le texte'): StudioError {
  if (error instanceof StudioError) return error;
  const name = error instanceof Error ? error.name : '';
  if (name === 'ModelRefusalError') return new StudioError('generation', (error as Error).message);
  console.error('[studio] IA', error instanceof Error ? `${error.name}: ${error.message}` : error);
  return new StudioError('generation', `${what} n’a pas pu être écrit : le service d’écriture ne répond pas. Réessaie dans un instant.`);
}
