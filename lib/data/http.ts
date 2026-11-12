import type { ProviderRunStats } from './provider';

/**
 * Client HTTP commun aux fournisseurs réels : file d'attente avec débit maximum, reprise avec attente
 * progressive, cache des réponses et nombre maximum d'appels par exécution.
 *
 * - Le débit (DATA_RATE_PER_SECOND) espace les requêtes : jamais deux départs à moins de 1/débit seconde.
 * - Reprise : seulement sur 429, 5xx (sauf 501), codes « trop de requêtes » du fournisseur et coupures
 *   réseau. Attente = Retry-After s'il est fourni, sinon 1 s, 2 s, 4 s… (+ un peu d'aléa), plafonnée à 60 s.
 *   Un délai dépassé n'est pas rejoué : l'issue est incertaine et la requête a pu être facturée.
 * - Quota (DATA_MAX_CALLS_PER_NIGHT) : au-delà, BudgetExceededError ; la tâche garde ce qu'elle a déjà.
 * - Cache (DATA_CACHE_HOURS) : relancer la tâche le même jour ne refait pas payer les mêmes appels.
 *   La clé de cache ne contient jamais de secret (ni signature, ni horodatage, ni jeton).
 */

export interface CacheStore {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, expiresAt: string): Promise<void>;
}

export class MemoryCache implements CacheStore {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();
  async get(key: string) {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry.value;
  }
  async set(key: string, value: unknown, expiresAt: string) {
    this.entries.set(key, { value, expiresAt: Date.parse(expiresAt) });
  }
}

export class BudgetExceededError extends Error {
  constructor(provider: string, budget: number) {
    super(`${provider} : quota de ${budget} appels atteint pour cette nuit (DATA_MAX_CALLS_PER_NIGHT).`);
    this.name = 'BudgetExceededError';
  }
}

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

export interface RawResponse {
  status: number;
  json: unknown;
  retryAfterMs: number | null;
}

export interface ProviderRequest<T> {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  /** Clé de cache stable, sans secret. null = pas de cache. */
  cacheKey: string | null;
  /** Lit la réponse ; lève ProviderHttpError (retryable ou non) sur une erreur. */
  parse: (response: RawResponse) => T;
}

export interface ProviderClientOptions {
  provider: string;
  ratePerSecond: number;
  maxCalls: number;
  cacheTtlHours: number;
  cache?: CacheStore;
  maxAttempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** « Retry-After » en secondes ou en date HTTP. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

/** Erreur HTTP standard : 429 et 5xx (sauf 501) peuvent être rejouées. */
export function httpError(provider: string, response: RawResponse, detail = ''): ProviderHttpError {
  const retryable = response.status === 429 || (response.status >= 500 && response.status !== 501);
  return new ProviderHttpError(
    `${provider} : HTTP ${response.status}${detail ? ` (${detail})` : ''}`,
    response.status,
    retryable,
    response.retryAfterMs,
  );
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ProviderClient {
  private readonly counters: ProviderRunStats;
  private nextSlot = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: ProviderClientOptions) {
    this.counters = {
      calls: 0,
      cacheHits: 0,
      retries: 0,
      budget: options.maxCalls,
      budgetReached: false,
      skipped: 0,
      rejectedImageHosts: [],
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxAttempts = options.maxAttempts ?? 4;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  stats(): ProviderRunStats {
    return { ...this.counters, rejectedImageHosts: [...this.counters.rejectedImageHosts] };
  }

  /** Compteurs tenus par l'adaptateur (produits écartés, images refusées). */
  noteSkipped(count = 1) {
    this.counters.skipped += count;
  }

  noteRejectedImageHost(host: string) {
    if (!this.counters.rejectedImageHosts.includes(host)) this.counters.rejectedImageHosts.push(host);
  }

  get budgetLeft(): number {
    return Math.max(0, this.options.maxCalls - this.counters.calls);
  }

  /** Attend son tour dans la file : un départ toutes les 1/débit secondes au plus. */
  private slot(): Promise<void> {
    const interval = 1000 / Math.max(0.1, this.options.ratePerSecond);
    const turn = this.queue.then(async () => {
      const wait = this.nextSlot - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.nextSlot = Math.max(Date.now(), this.nextSlot) + interval;
    });
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  async request<T>(request: ProviderRequest<T>): Promise<T> {
    const cacheKey = request.cacheKey ? `${this.options.provider}:${request.cacheKey}` : null;
    if (cacheKey && this.options.cache) {
      const hit = await this.options.cache.get(cacheKey);
      if (hit !== null && hit !== undefined) {
        this.counters.cacheHits++;
        return request.parse({ status: 200, json: hit, retryAfterMs: null });
      }
    }

    for (let attempt = 1; ; attempt++) {
      if (this.counters.calls >= this.options.maxCalls) {
        this.counters.budgetReached = true;
        throw new BudgetExceededError(this.options.provider, this.options.maxCalls);
      }
      await this.slot();
      this.counters.calls++;
      try {
        const raw = await this.send(request);
        const value = request.parse(raw);
        if (cacheKey && this.options.cache) {
          const expiresAt = new Date(Date.now() + this.options.cacheTtlHours * 3_600_000).toISOString();
          await this.options.cache.set(cacheKey, raw.json, expiresAt);
        }
        return value;
      } catch (error) {
        const retryable =
          error instanceof ProviderHttpError ? error.retryable : error instanceof TypeError; // coupure réseau
        if (!retryable || attempt >= this.maxAttempts) throw error;
        this.counters.retries++;
        const hinted = error instanceof ProviderHttpError ? error.retryAfterMs : null;
        const backoff = this.baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
        await this.sleep(Math.min(hinted ?? backoff, 60_000));
      }
    }
  }

  private async send(request: ProviderRequest<unknown>): Promise<RawResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        cache: 'no-store',
        signal: controller.signal,
      });
      const text = await response.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { status: response.status, json, retryAfterMs: parseRetryAfter(response.headers.get('retry-after')) };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Délai dépassé : non rejoué (issue incertaine).
        throw new ProviderHttpError(`${this.options.provider} : pas de réponse en ${this.timeoutMs / 1000} s`, 0, false);
      }
      throw error;
    }
  }
}
