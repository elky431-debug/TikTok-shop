import { checkTaskToken } from '../../lib/tasks/index';
import { runTask } from '../../lib/tasks/handlers';

/**
 * Fonction d'arrière-plan Netlify (suffixe « -background » : réponse 202 immédiate, puis jusqu'à 15 minutes de
 * travail). Exécute une tâche d'IA lancée par l'appli (scripts, série, analyse…). Refuse tout appel sans le jeton
 * HMAC de la tâche (`taskToken`).
 */
export default async (req: Request) => {
  const { userId, taskId } = (await req.json().catch(() => ({}))) as { userId?: string; taskId?: string };
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '') || null;
  if (!userId || !taskId || !checkTaskToken(userId, taskId, token)) {
    console.error('[tâches] appel refusé : jeton absent ou invalide.');
    return;
  }
  await runTask(userId, taskId);
};
