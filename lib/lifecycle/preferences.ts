import { getRepo, type Repo } from '@/lib/db';
import { isLifecycleType, type LifecycleType } from './types';

/** Types d'e-mails de cycle de vie coupés par l'utilisateur (fiche `cycle_vie_reglages`, une par utilisateur). */
export const LIFECYCLE_SETTINGS_KIND = 'cycle_vie_reglages';

interface LifecycleSettings {
  disabled: LifecycleType[];
}

export async function getDisabledLifecycle(userId: string, repo: Repo = getRepo()): Promise<Set<LifecycleType>> {
  const [record] = await repo.listRecords<LifecycleSettings>(userId, LIFECYCLE_SETTINGS_KIND);
  return new Set((record?.data.disabled ?? []).filter(isLifecycleType));
}

/** Remplace la liste des types coupés. */
export async function setDisabledLifecycle(userId: string, disabled: Iterable<LifecycleType>, repo: Repo = getRepo()) {
  const [record] = await repo.listRecords<LifecycleSettings>(userId, LIFECYCLE_SETTINGS_KIND);
  const list = [...new Set([...disabled].filter(isLifecycleType))].sort();
  await repo.saveRecord(userId, LIFECYCLE_SETTINGS_KIND, { disabled: list }, record?.id);
}

/** Coupe des types en plus de ceux déjà coupés. */
export async function disableLifecycle(userId: string, types: LifecycleType[], repo: Repo = getRepo()) {
  const current = await getDisabledLifecycle(userId, repo);
  await setDisabledLifecycle(userId, [...current, ...types], repo);
}
