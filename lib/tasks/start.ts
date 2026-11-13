import type { Profile } from '@/lib/db/types';
import { runTask } from './handlers';
import { deferTask, type TaskType } from './index';

/** Lance une tâche d'IA et renvoie la page à ouvrir (page d'attente sur Netlify, résultat direct en local). */
export function startTask(profile: Profile, type: TaskType, input: Record<string, unknown>, backPath: string): Promise<string> {
  return deferTask(profile, type, input, backPath, (userId, taskId) => runTask(userId, taskId));
}
