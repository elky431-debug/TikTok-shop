import { expect, it, vi } from 'vitest';
import { env } from '@/lib/env';
it('indices', () => {
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('OPENAI_API_KEY', '[ta clé OpenAI]');
  expect(env.aiKeyHints).toEqual(['ne commence pas par sk-', 'contient des espaces ou des retours à la ligne', 'contient des accents ou des caractères spéciaux', 'contient des crochets : texte d’exemple ?', 'trop courte (15 caractères)']);
  vi.stubEnv('OPENAI_API_KEY', '"sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD"');
  expect(env.aiKeyHints).toEqual(['ne commence pas par sk-', 'contient des guillemets (à retirer)']);
  vi.stubEnv('OPENAI_API_KEY', 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD');
  expect(env.aiKeyHints).toEqual([]);
});
