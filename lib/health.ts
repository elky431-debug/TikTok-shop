import { getLiveCatalog } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import { env, isLocalMode } from '@/lib/env';

/**
 * État de santé pour la surveillance (GET /api/health). Ne contient jamais de secret ni de message d'erreur brut :
 * seulement des noms, des booléens et des dates.
 *  - « down » (HTTP 503) : base injoignable, ou dernier relevé de plus de 36 heures ;
 *  - « degraded » (HTTP 200) : repli sur une autre source cette nuit, produits fictifs en production, dernière
 *    tâche en erreur, ou NEXT_PUBLIC_SITE_URL qui pointe encore vers localhost ;
 *  - « ok » sinon.
 */
export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  checkedAt: string;
  database: { kind: 'supabase' | 'local'; ok: boolean };
  data: {
    provider: string;
    /** Les clés du fournisseur choisi sont présentes (sans dire lesquelles). */
    configured: boolean;
    lastUsedProvider: string | null;
    fallbackLastRun: boolean;
  };
  refresh: {
    lastRunAt: string | null;
    lastRunStatus: 'running' | 'ok' | 'error' | null;
    dataDate: string | null;
    refreshedAt: string | null;
    stale: boolean;
    demo: boolean;
  };
  siteUrl: { value: string; ok: boolean };
  problems: string[];
}

function providerConfigured(name: string): boolean {
  if (name === 'tiktok') return Boolean(env.tiktokAppKey && env.tiktokAppSecret && env.tiktokAccessToken);
  if (name === 'nexscope') return Boolean(env.nexscopeApiKey);
  return true;
}

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), ms))]);

export async function healthReport(now: Date = new Date()): Promise<HealthReport> {
  const repo = getRepo();
  const problems: string[] = [];
  const production = process.env.VERCEL_ENV === 'production' || (process.env.NODE_ENV === 'production' && !isLocalMode());

  let databaseOk = true;
  let lastRun: Awaited<ReturnType<typeof repo.listCronRuns>>[number] | undefined;
  let catalog: Awaited<ReturnType<typeof getLiveCatalog>> | null = null;
  try {
    [[lastRun], catalog] = await withTimeout(Promise.all([repo.listCronRuns(1), getLiveCatalog(repo, now)]), 8000);
  } catch {
    databaseOk = false;
    problems.push('base de données injoignable');
  }

  const provider = env.dataProvider;
  const configured = providerConfigured(provider);
  if (!configured) problems.push(`clés du fournisseur « ${provider} » incomplètes`);
  const fallback = Boolean(lastRun?.details?.repli);
  if (fallback) problems.push('repli sur une autre source lors de la dernière tâche');
  if (lastRun?.status === 'error') problems.push('dernière tâche nocturne en erreur');
  if (catalog?.stale) problems.push('dernier relevé de plus de 36 heures');
  if (catalog && !catalog.products.length && databaseOk) problems.push('catalogue vide');
  if (production && catalog?.demo) problems.push('produits fictifs affichés en production');
  const siteOk = !production || !/localhost|127\.0\.0\.1/.test(env.siteUrl);
  if (!siteOk) problems.push('NEXT_PUBLIC_SITE_URL pointe vers localhost');

  const down = !databaseOk || Boolean(catalog?.stale);
  return {
    status: down ? 'down' : problems.length ? 'degraded' : 'ok',
    checkedAt: now.toISOString(),
    database: { kind: repo.kind, ok: databaseOk },
    data: {
      provider,
      configured,
      lastUsedProvider: typeof lastRun?.details?.provider === 'string' ? lastRun.details.provider : null,
      fallbackLastRun: fallback,
    },
    refresh: {
      lastRunAt: lastRun?.started_at ?? null,
      lastRunStatus: lastRun?.status ?? null,
      dataDate: catalog?.dataDate ?? null,
      refreshedAt: catalog?.refreshedAt ?? null,
      stale: catalog?.stale ?? false,
      demo: catalog?.demo ?? false,
    },
    siteUrl: { value: env.siteUrl, ok: siteOk },
    problems,
  };
}
