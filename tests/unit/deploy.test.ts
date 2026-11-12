import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { healthReport } from '@/lib/health';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { GET as cronGET } from '@/app/api/cron/refresh/route';
import { GET as healthGET } from '@/app/api/health/route';
import { parisDate } from '@/lib/utils';

let repo: LocalRepo;

beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});

afterEach(() => {
  setRepoForTests(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Netlify', () => {
  it('déclare la construction Next.js et le dossier des fonctions', () => {
    const toml = readFileSync('netlify.toml', 'utf8');
    expect(toml).toMatch(/command = "npm run build"/);
    expect(toml).toMatch(/directory = "netlify\/functions"/);
    expect(existsSync('vercel.json')).toBe(false);
  });

  it('planifie la tâche nocturne à 3 h UTC', async () => {
    const scheduled = await import('@/netlify/functions/nightly-refresh.mts');
    expect(scheduled.config).toEqual({ schedule: '0 3 * * *' });
  });

  it('planifie la tâche Discord toutes les heures et l’envoie à /api/cron/discord', async () => {
    const hourly = await import('@/netlify/functions/discord-hourly.mts');
    expect(hourly.config).toEqual({ schedule: '0 * * * *' });
    vi.stubEnv('URL', 'https://tracktout.example');
    vi.stubEnv('CRON_SECRET', 'secret-cron-test');
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await hourly.default(new Request('https://tracktout.example', { method: 'POST', body: '{}' }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://tracktout.example/api/cron/discord');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-cron-test');
    vi.unstubAllGlobals();
  });

  it('la fonction planifiée appelle /api/cron/refresh avec CRON_SECRET', async () => {
    vi.stubEnv('URL', 'https://tracktout.example');
    vi.stubEnv('CRON_SECRET', 'secret-cron-test');
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const scheduled = await import('@/netlify/functions/nightly-refresh.mts');
    await scheduled.default(new Request('https://tracktout.example', { method: 'POST', body: JSON.stringify({ next_run: 'demain' }) }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://tracktout.example/api/cron/refresh');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-cron-test');
    vi.unstubAllGlobals();
  });

  it('sur Netlify, la route lance la tâche en arrière-plan et répond 202', async () => {
    vi.stubEnv('SITE_ID', 'site-test');
    vi.stubEnv('URL', 'https://tracktout.example');
    vi.stubEnv('CRON_SECRET', 'secret-cron-test');
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await cronGET(new Request('https://tracktout.example/api/cron/refresh', { headers: { authorization: 'Bearer secret-cron-test' } }));
    expect(response.status).toBe(202);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://tracktout.example/.netlify/functions/nightly-refresh-background');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-cron-test');
    vi.unstubAllGlobals();
  });

  it('la fonction d’arrière-plan refuse un appel sans le bon secret', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-cron-test');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const background = await import('@/netlify/functions/nightly-refresh-background.mts');
    await background.default(new Request('https://tracktout.example', { method: 'POST', headers: { authorization: 'Bearer faux' } }));
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('appel refusé'));
    expect(await repo.listCronRuns(1)).toEqual([]);
  });
});

describe('/api/cron/refresh', () => {
  it('refuse un appel sans le bon CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-cron-test');
    const denied = await cronGET(new Request('http://localhost/api/cron/refresh', { headers: { authorization: 'Bearer faux' } }));
    expect(denied.status).toBe(401);
  });

  it('hors Netlify, travaille directement, puis ne refait pas le travail le même jour', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-cron-test');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const call = () => cronGET(new Request('http://localhost/api/cron/refresh', { headers: { authorization: 'Bearer secret-cron-test' } }));
    const first = await call();
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body).toMatchObject({ ok: true, provider: 'mock', date: parisDate() });
    expect(JSON.stringify(body)).not.toContain('secret-cron-test');
    const second = await (await call()).json();
    expect(second).toEqual({ skipped: true, reason: 'Déjà exécutée aujourd’hui.' });
  }, 30_000);
});

describe('/api/health', () => {
  it('dit l’état de la base, de la source et du dernier relevé, sans aucun secret', async () => {
    const secrets = { SUPABASE_SERVICE_ROLE_KEY: '', NEXSCOPE_API_KEY: 'cle-nexscope-secrete', CRON_SECRET: 'cron-secret-sante', STRIPE_SECRET_KEY: '' };
    for (const [k, v] of Object.entries(secrets)) vi.stubEnv(k, v);
    vi.stubEnv('DATA_PROVIDER', 'nexscope');
    await refreshCatalog({ repo, provider: new MockProvider() });
    const response = await healthGET();
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    for (const value of Object.values(secrets).filter(Boolean)) expect(text).not.toContain(value);
    const report = JSON.parse(text);
    expect(report).toMatchObject({
      database: { kind: 'local', ok: true },
      data: { provider: 'nexscope', configured: true },
      refresh: { dataDate: parisDate(), stale: false, demo: true },
    });
  });

  it('passe en « down » (503) quand le dernier relevé a plus de 36 heures', async () => {
    await refreshCatalog({ repo, provider: new MockProvider(), date: '2026-11-01' });
    const report = await healthReport(new Date(Date.now() + 40 * 3_600_000));
    // Relevé écrit maintenant, contrôlé 40 heures plus tard.
    expect(report.status).toBe('down');
    expect(report.problems).toContain('dernier relevé de plus de 36 heures');
  });

  it('signale en production des produits fictifs et une URL du site restée sur localhost', async () => {
    vi.stubEnv('SITE_ID', 'site-test');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    await refreshCatalog({ repo, provider: new MockProvider() });
    const report = await healthReport();
    expect(report.status).toBe('degraded');
    expect(report.problems).toEqual(expect.arrayContaining(['produits fictifs affichés en production', 'NEXT_PUBLIC_SITE_URL pointe vers localhost']));
  });

  it('passe en « down » si la base ne répond pas', async () => {
    vi.spyOn(repo, 'listCronRuns').mockRejectedValue(new Error('connexion refusée à db.interne:5432'));
    const response = await healthGET();
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain('db.interne');
    expect(JSON.parse(text).database.ok).toBe(false);
  });
});
