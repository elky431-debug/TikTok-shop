import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Generation } from '@/lib/ai/schema';

// Faux client Anthropic : on contrôle les réponses successives de messages.parse.
const parse = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status?: number;
  }
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    static NotFoundError = class extends APIError {};
    static APIConnectionError = class extends APIError {};
    messages = { parse };
  }
  return { default: Anthropic };
});
vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({ zodOutputFormat: () => ({ type: 'json_schema' }) }));

const product = {
  id: 'p1',
  name: 'Sérum éclat',
  niche: 'beaute' as const,
  description: 'Flacon de 30 ml.',
  price_cents: 1990,
  commission_rate: 0.2,
  free_sample: true,
  shop_name: 'Atelier Test',
};
const input = { product, format: 'demo' as const, style: 'face_camera', examplePhrase: null, firstName: 'Léa', topVideos: [] };

function valid(): Generation {
  return {
    hooks: Array.from({ length: 10 }, (_, i) => ({ text: `Regarde ça, numéro ${i + 1}.`, seconds: 1.5 })),
    scripts: Array.from({ length: 3 }, (_, i) => ({
      title: `Angle ${i + 1}`,
      angle: 'Démo rapide',
      duration_seconds: 30,
      shots: [
        { time: '0–3 s', visual: 'Gros plan', voice: 'Regarde ça.', on_screen_text: 'Regarde' },
        { time: '3–20 s', visual: 'Démo', voice: 'Je te montre.', on_screen_text: 'Démo' },
        { time: '20–30 s', visual: 'Panier', voice: 'C’est dans le panier orange.', on_screen_text: 'Panier orange' },
      ],
      call_to_action: 'Panier orange',
      caption: 'Test du jour',
      hashtags: ['tiktokshop', '#beauté'],
    })),
  };
}

describe('génération avec Claude', () => {
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = '';
  });

  beforeEach(() => {
    parse.mockReset();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.ANTHROPIC_MODEL = '';
  });

  it('utilise le modèle par défaut, ajoute le rappel #publicité et normalise les hashtags', async () => {
    parse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: valid() });
    const { generateScripts } = await import('@/lib/ai/scripts');
    const out = await generateScripts(input);
    expect(out.source).toBe('claude');
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0][0].model).toBe('claude-sonnet-5-5');
    expect(parse.mock.calls[0][0].system).toMatch(/TikTok Shop en France/);
    expect(out.scripts[0].hashtags).toEqual(['#tiktokshop', '#beauté']);
    expect(out.scripts.every((s) => /#publicité/.test(s.disclosure))).toBe(true);
  });

  it('réessaie une fois si le JSON est invalide', async () => {
    parse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: null });
    parse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: valid() });
    const { generateScripts } = await import('@/lib/ai/scripts');
    const out = await generateScripts(input);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(out.hooks).toHaveLength(10);
  });

  it('réessaie si la sortie enfreint les règles, puis retire ce qui reste fautif', async () => {
    const bad = valid();
    bad.hooks[0].text = 'Un effet miracle sur ta peau';
    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: bad });
    const { generateScripts } = await import('@/lib/ai/scripts');
    const out = await generateScripts(input);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1][0].messages[0].content).toMatch(/ne respectait pas les règles/);
    expect(out.hooks.some((h) => /miracle/.test(h.text))).toBe(false);
    expect(out.hooks).toHaveLength(10);
  });

  it('échoue proprement après deux réponses vides', async () => {
    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: null });
    const { generateScripts, ScriptGenerationError } = await import('@/lib/ai/scripts');
    await expect(generateScripts(input)).rejects.toBeInstanceOf(ScriptGenerationError);
    expect(parse).toHaveBeenCalledTimes(2);
  });
});
