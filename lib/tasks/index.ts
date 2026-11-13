import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Repo } from '@/lib/db';
import { getRepo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { env } from '@/lib/env';

/**
 * Tâches d'IA en arrière-plan. Sur Netlify, une fonction synchrone est coupée au bout de 10 s ; une génération de
 * scripts en prend 15 à 40. L'action vérifie vite les droits et le quota, enregistre une tâche (fiche `tache_ia`), la
 * confie à la fonction d'arrière-plan `taches-background` (jusqu'à 15 min) et ouvre `/app/attente/<id>`, qui se
 * rafraîchit seule puis renvoie au résultat. En local et dans les tests, la tâche tourne directement (même code).
 */
export const TASK_KIND = 'tache_ia';

export const TASK_TYPES = ['studio', 'serie', 'angle', 'style', 'analyse', 'offre', 'preparation', 'accroches'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export interface TaskData {
  type: TaskType;
  status: 'en_cours' | 'fait' | 'echec';
  input: Record<string, unknown>;
  /** Où revenir si la personne abandonne (page de départ). */
  back_path: string;
  /** Page à ouvrir une fois la tâche finie (résultat, ou page de départ avec son message d'erreur). */
  result_path: string | null;
  /** Message d'erreur inattendue (les erreurs prévues passent par `result_path`). */
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** Travail d'une tâche : renvoie la page à ouvrir ensuite (succès ou échec prévu, comme l'ancienne redirection). */
export type TaskHandler = (profile: Profile, input: Record<string, unknown>, repo: Repo) => Promise<string>;

/** Au-delà, une tâche jamais démarrée est déclarée en échec (fonction d'arrière-plan injoignable). */
export const START_TIMEOUT_MS = 60_000;

function secret(): string {
  return env.cronSecret || env.supabaseServiceKey || 'tracktout-local';
}

/** Jeton de la tâche (HMAC, jamais le secret lui-même) : la fonction d'arrière-plan refuse tout autre appel. */
export function taskToken(userId: string, taskId: string): string {
  return createHmac('sha256', secret()).update(`${userId}:${taskId}`).digest('hex');
}

export function checkTaskToken(userId: string, taskId: string, token: string | null): boolean {
  if (!token) return false;
  const expected = Buffer.from(taskToken(userId, taskId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Sur Netlify (variable SITE_ID fournie à l'exécution), sauf TASKS_INLINE=1. */
export function runsInBackground(): boolean {
  return Boolean(process.env.SITE_ID) && process.env.TASKS_INLINE !== '1';
}

function functionUrl(): string {
  const base = (process.env.DEPLOY_URL || process.env.DEPLOY_PRIME_URL || process.env.URL || env.siteUrl).replace(/\/$/, '');
  return `${base}/.netlify/functions/taches-background`;
}

type Runner = (userId: string, taskId: string) => Promise<void>;

/**
 * Enregistre la tâche et la lance ; renvoie la page à ouvrir. `run` est `runTask` (passé en paramètre pour que ce
 * module n'importe pas les fonctionnalités).
 */
export async function deferTask(
  profile: Profile,
  type: TaskType,
  input: Record<string, unknown>,
  backPath: string,
  run: Runner,
  repo: Repo = getRepo(),
): Promise<string> {
  const data: TaskData = {
    type,
    status: 'en_cours',
    input,
    back_path: backPath,
    result_path: null,
    error: null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
  };
  const record = await repo.saveRecord<TaskData>(profile.id, TASK_KIND, data);
  await pruneTasks(repo, profile.id, record.id);

  if (runsInBackground()) {
    try {
      const response = await fetch(functionUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${taskToken(profile.id, record.id)}` },
        body: JSON.stringify({ userId: profile.id, taskId: record.id }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.status < 300) return `/app/attente/${record.id}`;
      console.error('[tâches] lancement refusé', response.status);
    } catch (error) {
      console.error('[tâches] lancement impossible', error instanceof Error ? error.message : error);
    }
  }
  // En local, dans les tests, ou si la fonction d'arrière-plan est injoignable : tout de suite.
  await run(profile.id, record.id);
  const done = await repo.getRecord<TaskData>(profile.id, record.id);
  return done?.data.result_path ?? `/app/attente/${record.id}`;
}

/** On garde les 30 dernières tâches. */
async function pruneTasks(repo: Repo, userId: string, keepId: string) {
  const all = await repo.listRecords<TaskData>(userId, TASK_KIND);
  for (const old of all.filter((r) => r.id !== keepId).slice(29)) await repo.deleteRecord(userId, old.id);
}

/** Exécute une tâche une seule fois (une autre exécution de la même tâche s'arrête tout de suite). */
export async function executeTask(userId: string, taskId: string, handlers: Record<TaskType, TaskHandler>, repo: Repo = getRepo()) {
  const record = await repo.getRecord<TaskData>(userId, taskId);
  if (!record || record.kind !== TASK_KIND || record.data.status !== 'en_cours' || record.data.started_at) return;
  const started = await repo.saveRecord<TaskData>(userId, TASK_KIND, { ...record.data, started_at: new Date().toISOString() }, record.id);
  const profile = await repo.getProfile(userId);
  let next: TaskData;
  try {
    if (!profile) throw new Error('profil introuvable');
    const handler = handlers[record.data.type];
    if (!handler) throw new Error(`type de tâche inconnu : ${record.data.type}`);
    const path = await handler(profile, record.data.input, repo);
    next = { ...started.data, status: 'fait', result_path: path, finished_at: new Date().toISOString() };
  } catch (error) {
    console.error('[tâches]', record.data.type, taskId, error instanceof Error ? error.message : error);
    next = {
      ...started.data,
      status: 'echec',
      error: 'Le travail n’a pas pu aller au bout. Réessaie dans un instant.',
      finished_at: new Date().toISOString(),
    };
  }
  await repo.saveRecord<TaskData>(userId, TASK_KIND, next, record.id);
}

/** État affiché par la page d'attente (une tâche jamais démarrée au bout d'une minute est déclarée en échec). */
export function taskView(data: TaskData, now = Date.now()): { state: 'en_cours' | 'fait' | 'echec'; path: string | null; error: string | null; slow: boolean } {
  if (data.status === 'fait') return { state: 'fait', path: data.result_path, error: null, slow: false };
  if (data.status === 'echec') return { state: 'echec', path: data.result_path, error: data.error, slow: false };
  const age = now - Date.parse(data.created_at);
  if (!data.started_at && age > START_TIMEOUT_MS) {
    return { state: 'echec', path: null, error: 'Le travail n’a pas démarré. Rien n’a été décompté : réessaie.', slow: false };
  }
  return { state: 'en_cours', path: null, error: null, slow: age > 90_000 };
}
