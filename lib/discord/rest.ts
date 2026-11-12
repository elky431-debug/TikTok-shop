import { env } from '@/lib/env';

/**
 * Appels à l'API REST de Discord (doc officielle, dépôt discord/discord-api-docs : reference, topics/rate-limits).
 * - base https://discord.com/api/v10, en-tête « Authorization: Bot <jeton> », User-Agent « DiscordBot ($url, $version) » ;
 * - 429 : on attend `retry_after` secondes (corps JSON) ou l'en-tête Retry-After, puis on réessaie (2 fois au plus).
 * Le jeton n'apparaît jamais dans les messages d'erreur.
 */
const API = 'https://discord.com/api/v10';

let fetchForTests: typeof fetch | null = null;
/** Tests : remplace les appels réseau (on vérifie les requêtes exactes envoyées à Discord). */
export function setDiscordFetchForTests(impl: typeof fetch | null) {
  fetchForTests = impl;
}

export class DiscordApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'DiscordApiError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function discordApi<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  if (!env.discordBotToken) throw new DiscordApiError(0, null, 'DISCORD_BOT_TOKEN manquant.');
  const doFetch = fetchForTests ?? fetch;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await doFetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bot ${env.discordBotToken}`,
        'user-agent': `DiscordBot (${env.siteUrl}, 1.0)`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    if (response.status === 429) {
      const json = (await response.json().catch(() => ({}))) as { retry_after?: number };
      const wait = Number(json.retry_after ?? response.headers.get('retry-after') ?? 1);
      await sleep(Math.min(Math.max(wait, 0.1), 10) * 1000);
      continue;
    }
    const text = await response.text();
    if (!response.ok) {
      let code: number | null = null;
      let message = text.slice(0, 200);
      try {
        const json = JSON.parse(text) as { code?: number; message?: string };
        code = json.code ?? null;
        message = json.message ?? message;
      } catch {
        // corps non JSON
      }
      throw new DiscordApiError(response.status, code, `Discord ${method} ${path.replace(/\d{15,}/g, '…')} : HTTP ${response.status} ${message}`);
    }
    return (text ? JSON.parse(text) : null) as T;
  }
  throw new DiscordApiError(429, null, 'Discord : trop de requêtes, réessaie plus tard.');
}
