import { createProvider, providerChain, type ProductDataProvider } from '@/lib/data';
import { getRepo, type Repo } from '@/lib/db';
import type { CronRun } from '@/lib/db/types';
import { prepareDigests } from '@/lib/digest/prepare';
import { getLiveCatalog } from '@/lib/catalog';
import { env, isLocalMode } from '@/lib/env';
import { parisDate } from '@/lib/utils';
import { MockProvider } from '@/lib/data/mock';
import { refreshCatalog, type RefreshResult } from './refresh';
import { afterRefreshHooks } from './hooks';

export interface NightlyResult {
  refresh: RefreshResult;
  digests: { prepared: number; skipped?: string };
  extra: Record<string, unknown>;
  /** Fournisseurs essayés sans succès avant celui qui a servi (vide si tout s'est bien passé). */
  fallbacks: Array<{ provider: string; error: string }>;
}

/**
 * Rafraîchit avec le fournisseur choisi ; s'il échoue, passe au suivant (Nexscope si configuré, puis les données
 * fictives). Chaque échec est écrit dans les journaux et dans l'historique de la tâche (écran admin).
 * Les produits fictifs ne sont jamais présentés comme réels : voir lib/catalog.ts.
 */
async function refreshWithFallback(date: string, repo: Repo, backfillDays?: number) {
  const fallbacks: NightlyResult['fallbacks'] = [];
  for (const name of providerChain()) {
    try {
      const refresh = await refreshCatalog({ date, repo, backfillDays, provider: createProvider(name) });
      return { refresh, fallbacks };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fallbacks.push({ provider: name, error: message });
      console.error(`[tâche nocturne] fournisseur « ${name} » en échec : ${message}`);
      if (name === 'mock') throw error;
    }
  }
  throw new Error('Aucun fournisseur de données disponible.');
}

/**
 * Tâche nocturne complète (3 h UTC : 4 h à Paris l'hiver, 5 h l'été) :
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
    await repo.purgeProviderCache().catch(() => 0);
    const { refresh, fallbacks } = options.provider
      ? { refresh: await refreshCatalog({ date, repo, backfillDays: options.backfillDays, provider: options.provider }), fallbacks: [] }
      : await refreshWithFallback(date, repo, options.backfillDays);
    if (fallbacks.length) {
      console.warn(`[tâche nocturne] repli sur « ${refresh.provider} » après ${fallbacks.length} échec(s).`);
    }
    const digests = await prepareDigests(date, repo);
    const extra = await afterRefreshHooks(date, repo);
    const result = { refresh, digests, extra, fallbacks };
    await repo.finishCronRun(run.id, 'ok', {
      ...refresh,
      digests: digests.prepared,
      ...(digests.skipped ? { recaps_non_prepares: digests.skipped } : {}),
      ...extra,
      ...(fallbacks.length ? { repli: fallbacks } : {}),
    });
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
    // Avec un fournisseur réel, pas d'historique fictif : un vrai premier relevé (repli fictif s'il échoue).
    if (env.dataProvider === 'mock') {
      await runNightly({ trigger: 'seed', backfillDays: 30, repo, date: today, provider: new MockProvider() });
    } else {
      await runNightly({ trigger: 'seed', repo, date: today });
    }
    return;
  }
  const { dataDate } = await getLiveCatalog(repo);
  if (dataDate === today) return;
  // Une seule tentative par jour : si la source réelle est en panne, on n'insiste pas à chaque page affichée.
  const [last] = await repo.listCronRuns(1);
  if (last && parisDate(new Date(last.started_at)) === today) return;
  await runNightly({ trigger: 'cron', repo, date: today });
}
