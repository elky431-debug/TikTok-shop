import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PROMPT } from '@/lib/ai/prompt';
import { OpenAIScriptModel } from '@/lib/ai/providers/openai';
import type { Generation } from '@/lib/ai/schema';
import { generateScripts, regenerateHook, ScriptGenerationError } from '@/lib/ai/scripts';
import { env, isAiConfigured } from '@/lib/env';

/**
 * Adaptateur OpenAI avec le vrai SDK (`openai` 7.55.0) et un faux `fetch` : on vérifie la requête envoyée à la
 * Responses API et le traitement des réponses (valide, JSON invalide, interdits, refus, erreurs).
 */

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

/** Réponse de la Responses API avec un message texte (ou un refus). */
function apiResponse(content: Array<Record<string, unknown>>, status = 'completed') {
  return {
    id: 'resp_test',
    object: 'response',
    created_at: 1_763_000_000,
    status,
    model: 'gpt-5.5',
    incomplete_details: status === 'incomplete' ? { reason: 'max_output_tokens' } : null,
    output: [{ type: 'message', id: 'msg_test', role: 'assistant', status, content }],
  };
}
const text = (value: string) => ({ type: 'output_text', text: value, annotations: [] });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(...responses: Response[]) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => responses.shift() ?? json(apiResponse([text('{}')])));
}
const bodyOf = (fetchMock: ReturnType<typeof fakeFetch>, call = 0) => JSON.parse(String(fetchMock.mock.calls[call][1]?.body));

beforeEach(() => {
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai');
  vi.stubEnv('OPENAI_MODEL', '');
});

afterEach(() => vi.unstubAllEnvs());

describe('choix du fournisseur', () => {
  it('suit AI_PROVIDER, et retombe sur le simulé si la clé du fournisseur choisi manque', () => {
    expect(env.aiProvider).toBe('openai');
    expect(env.openaiModel).toBe('gpt-5.5');
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(env.aiProvider).toBeNull();
    expect(isAiConfigured()).toBe(false);
    vi.stubEnv('AI_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    expect(env.aiProvider).toBe('anthropic');
    vi.stubEnv('AI_PROVIDER', '');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai');
    expect(env.aiProvider).toBe('anthropic'); // sans AI_PROVIDER : Claude d'abord s'il a sa clé
  });
});

describe('génération avec OpenAI', () => {
  it('envoie une requête Responses API avec un JSON Schema strict, sans conserver la demande', async () => {
    const fetchMock = fakeFetch(json(apiResponse([text(JSON.stringify(valid()))])));
    const out = await generateScripts(input, new OpenAIScriptModel({ fetch: fetchMock as unknown as typeof fetch }));
    expect(out).toMatchObject({ source: 'openai', attempts: 1, firstProblems: [] });
    expect(out.scripts.every((s) => /#publicité/.test(s.disclosure))).toBe(true);
    expect(out.scripts[0].hashtags).toEqual(['#tiktokshop', '#beauté']);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-test-openai');
    const body = bodyOf(fetchMock);
    expect(body).toMatchObject({ model: 'gpt-5.5', instructions: SYSTEM_PROMPT, store: false, max_output_tokens: 16000 });
    expect(body.text.format).toMatchObject({ type: 'json_schema', name: 'scripts_video', strict: true });
    expect(Object.keys(body.text.format.schema.properties)).toEqual(['hooks', 'scripts']);
    expect(body.input).toMatch(/Sérum éclat/);
  });

  it('suit OPENAI_MODEL', async () => {
    vi.stubEnv('OPENAI_MODEL', 'gpt-5.4-mini');
    const fetchMock = fakeFetch(json(apiResponse([text(JSON.stringify(valid()))])));
    await generateScripts(input, new OpenAIScriptModel({ fetch: fetchMock as unknown as typeof fetch }));
    expect(bodyOf(fetchMock).model).toBe('gpt-5.4-mini');
  });

  it('réessaie une fois si le JSON est illisible ou hors schéma', async () => {
    const broken = { ...valid(), scripts: 'pas une liste' };
    for (const first of [text('ceci n’est pas du JSON'), text(JSON.stringify(broken))]) {
      const fetchMock = fakeFetch(json(apiResponse([first])), json(apiResponse([text(JSON.stringify(valid()))])));
      const out = await generateScripts(input, new OpenAIScriptModel({ fetch: fetchMock as unknown as typeof fetch }));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(out).toMatchObject({ attempts: 2, firstProblems: ['JSON invalide ou incomplet'] });
      expect(out.hooks).toHaveLength(10);
    }
  });

  it('réessaie si une réponse est coupée (plafond de jetons)', async () => {
    const fetchMock = fakeFetch(
      json(apiResponse([text('{"hooks": [')], 'incomplete')),
      json(apiResponse([text(JSON.stringify(valid()))])),
    );
    const out = await generateScripts(input, new OpenAIScriptModel({ fetch: fetchMock as unknown as typeof fetch }));
    expect(out.attempts).toBe(2);
  });

  it('applique la liste des interdits : nouvel essai avec la correction, puis retrait de ce qui reste', async () => {
    const bad = valid();
    bad.hooks[0].text = 'Un effet miracle sur ta peau';
    bad.scripts[0].shots[1].voice = 'Ça guérit tout. Je te montre.';
    const fetchMock = fakeFetch(json(apiResponse([text(JSON.stringify(bad))])), json(apiResponse([text(JSON.stringify(bad))])));
    const out = await generateScripts(input, new OpenAIScriptModel({ fetch: fetchMock as unknown as typeof fetch }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 1).input).toMatch(/ne respectait pas les règles : .*superlatif non prouvé/);
    expect(out.firstProblems.join(' ')).toMatch(/promesse médicale/);
    expect(out.hooks.some((h) => /miracle/.test(h.text))).toBe(false);
    expect(out.scripts[0].shots[1].voice).toBe('Je te montre.');
  });

  it('dit clairement quand le modèle refuse, sans réessayer', async () => {
    const fetchMock = fakeFetch(json(apiResponse([{ type: 'refusal', refusal: 'Je ne peux pas aider.' }])));
    await expect(generateScripts(input, new OpenAIScriptModel({ fetch: fetchMock as unknown as typeof fetch }))).rejects.toThrow(
      'n’a pas pu être traité',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('traduit les erreurs de l’API en français, sans jamais montrer la clé', async () => {
    const fetchMock = fakeFetch(json({ error: { message: 'Incorrect API key provided: sk-test-openai', type: 'invalid_request_error' } }, 401));
    const error = await generateScripts(input, new OpenAIScriptModel({ fetch: fetchMock as unknown as typeof fetch })).catch((e) => e);
    expect(error).toBeInstanceOf(ScriptGenerationError);
    expect(error.message).toBe('La clé OPENAI_API_KEY est refusée : vérifie-la dans les réglages.');
    expect(error.message).not.toContain('sk-test-openai');
  });

  it('régénère une accroche avec un schéma dédié', async () => {
    const fetchMock = fakeFetch(json(apiResponse([text(JSON.stringify({ hook: { text: 'Tu l’as déjà vu passer ?', seconds: 1.4 } }))])));
    const hook = await regenerateHook(input, ['Regarde ça.'], 1, new OpenAIScriptModel({ fetch: fetchMock as unknown as typeof fetch }));
    expect(hook).toEqual({ text: 'Tu l’as déjà vu passer ?', seconds: 1.4 });
    expect(bodyOf(fetchMock).text.format).toMatchObject({ name: 'accroche', strict: true });
  });
});
