import type { Repo } from '@/lib/db';

/**
 * Étapes ajoutées après le rafraîchissement (planification des e-mails, fin des essais simulés…).
 * Complété aux jalons suivants.
 */
export async function afterRefreshHooks(_date: string, _repo: Repo): Promise<Record<string, unknown>> {
  return {};
}
