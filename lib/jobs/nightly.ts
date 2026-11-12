import type { ProductDataProvider } from '@/lib/data';
import { getRepo, type Repo } from '@/lib/db';
import type { CronRun } from '@/lib/db/types';
import { prepareDigests } from '@/lib/digest/prepare';
import { isLocalMode } from '@/lib/env';
import { parisDate } from '@/lib/utils';
import { MockProvider } from '@/lib/data/mock';
import { refreshCatalog, type RefreshResult } from './refresh';
import { afterRefreshHooks } from './hooks';

export interface NightlyResult {
  refresh: RefreshResult;
  digests: { prepared: number };
  extra: Record<string, unknown>;
}

/**
 * Tâche nocturne complète (4 h, heure de Paris) :
 * 1. produits du jour via le fournisseur actif ; 2. instantané quotidien ; 3. score ;
 * 4. récap du matin de chaque utilisateur (puis planification des envois).
 */
export async function runNightly(
  options: {
    trigger?: CronRun['trigger'];
    date?: string;
    backfillDays?: number;
    repo?: Repo;
    provider?: ProductDataProvider;
  } = {},
): Promise<NightlyResult> {
  const repo = options.repo ?? getRepo();
  const date = options.date ?? parisDate();
  const run = await repo.startCronRun('refresh', options.trigger ?? 'cron');
  try {
    const refresh = await refreshCatalog({ date, repo, backfillDays: options.backfillDays, provider: options.provider });
    const digests = await prepareDigests(date, repo);
    const extra = await afterRefreshHooks(date, repo);
    const result = { refresh, digests, extra };
    await repo.finishCronRun(run.id, 'ok', { ...refresh, digests: digests.prepared, ...extra });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repo.finishCronRun(run.id, 'error', { date, error: message });
    throw error;
  }
}

/**
 * Garantit un catalogue à jour sans tâche planifiée en mode local :
 * base vide ⇒ seed de 30 jours ; nouveau jour ⇒ rafraîchissement du jour.
 */
export async function ensureCatalog(repo: Repo = getRepo()): Promise<void> {
  if (!isLocalMode()) return;
  const today = parisDate();
  const count = await repo.countProducts();
  if (count === 0) {
    await runNightly({ trigger: 'seed', backfillDays: 30, repo, date: today, provider: new MockProvider() });
    return;
  }
  const [sample] = await repo.listProducts();
  if (sample && sample.snapshot_date !== today) {
    await runNightly({ trigger: 'cron', repo, date: today });
  }
}
