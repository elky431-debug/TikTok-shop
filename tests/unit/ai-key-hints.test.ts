import { expect, it, vi } from 'vitest';
import { env } from '@/lib/env';

it('indices sur la forme de la clé, sans jamais la montrer', () => {
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('OPENAI_API_KEY', '[ta clé OpenAI]');
  expect(env.aiKeyHints).toEqual([
    'contient des espaces ou des retours à la ligne',
    'contient des accents ou des caractères spéciaux',
    'contient des crochets : texte d’exemple ?',
    'trop courte (15 caractères)',
  ]);
  vi.stubEnv('OPENAI_API_KEY', '"fausse-cle-openai-pour-test"');
  expect(env.aiKeyHints).toEqual(['contient des guillemets (à retirer)']);
  vi.stubEnv('OPENAI_API_KEY', 'fausse-cle-openai-pour-test');
  expect(env.aiKeyHints).toEqual([]);
  expect(env.aiKeyProblem).toBeNull();
});
