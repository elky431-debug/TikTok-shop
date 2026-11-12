import { readFileSync } from 'node:fs';
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
  vi.useRealTimers();
});

describe('vercel.json', () => {
  it('lance la tâche nocturne une fois par jour à 3 h UTC', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
    expect(config.crons).toEqual([{ path: '/api/cron/refresh', schedule: '0 3 * * *' }]);
  });
});

describe('/api/cron/refresh', () => {
  it('refuse un appel sans le bon CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-cron-test');
    const denied = await cronGET(new Request('http://localhost/api/cron/refresh', { headers: { authorization: 'Bearer faux' } }));
    expect(denied.status).toBe(401);
  });

  it('travaille à l’appel de Vercel, puis ne refait pas le travail le même jour', async () => {
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
    vi.stubEnv('VERCEL_ENV', 'production');
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
