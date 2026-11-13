import { describe, expect, it, vi } from 'vitest';
import { checkTaskToken, deferTask, executeTask, runsInBackground, taskToken, taskView, type TaskData, type TaskHandler } from '@/lib/tasks';

function fakeRepo() {
  const records = new Map<string, { id: string; user_id: string; kind: string; data: unknown; created_at: string; updated_at: string }>();
  let n = 0;
  return {
    records,
    getProfile: async (id: string) => ({ id, plan: 'pro', first_name: 'Léa' }),
    saveRecord: async (userId: string, kind: string, data: unknown, id?: string) => {
      const rid = id ?? `t${++n}`;
      const r = { id: rid, user_id: userId, kind, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      records.set(rid, r);
      return r;
    },
    getRecord: async (userId: string, id: string) => {
      const r = records.get(id);
      return r && r.user_id === userId ? r : null;
    },
    listRecords: async (userId: string, kind: string) => [...records.values()].filter((r) => r.user_id === userId && r.kind === kind).reverse(),
    deleteRecord: async (_u: string, id: string) => void records.delete(id),
  };
}

describe('tâches d’IA en arrière-plan', () => {
  it('en local, la tâche tourne tout de suite et renvoie la page du résultat', async () => {
    vi.stubEnv('SITE_ID', '');
    expect(runsInBackground()).toBe(false);
    const repo = fakeRepo();
    const calls: unknown[] = [];
    const handlers = { studio: (async (_p, input) => (calls.push(input), '/app/studio/doc-1')) as TaskHandler } as Record<string, TaskHandler>;
    const path = await deferTask({ id: 'u1' } as never, 'studio', { produit: 'p1' }, '/app/studio', (u, t) => executeTask(u, t, handlers as never, repo as never), repo as never);
    expect(path).toBe('/app/studio/doc-1');
    expect(calls).toEqual([{ produit: 'p1' }]);
    const [task] = [...repo.records.values()];
    expect(task.data).toMatchObject({ status: 'fait', result_path: '/app/studio/doc-1' });
  });

  it('une tâche ne tourne qu’une fois, et une panne devient un échec lisible', async () => {
    const repo = fakeRepo();
    let runs = 0;
    const handlers = {
      offre: (async () => {
        runs++;
        throw new Error('panne');
      }) as TaskHandler,
    } as never;
    const rec = await repo.saveRecord('u1', 'tache_ia', {
      type: 'offre', status: 'en_cours', input: {}, back_path: '/app/offres', result_path: null, error: null, created_at: new Date().toISOString(), started_at: null, finished_at: null,
    } satisfies TaskData);
    await executeTask('u1', rec.id, handlers, repo as never);
    await executeTask('u1', rec.id, handlers, repo as never);
    expect(runs).toBe(1);
    expect((await repo.getRecord('u1', rec.id))!.data).toMatchObject({ status: 'echec', error: expect.stringMatching(/Réessaie/) });
    // Une tâche d'un autre compte n'est jamais lancée.
    await executeTask('u2', rec.id, handlers, repo as never);
    expect(runs).toBe(1);
  });

  it('jeton propre à la tâche et à la personne', () => {
    const token = taskToken('u1', 't1');
    expect(checkTaskToken('u1', 't1', token)).toBe(true);
    expect(checkTaskToken('u2', 't1', token)).toBe(false);
    expect(checkTaskToken('u1', 't2', token)).toBe(false);
    expect(checkTaskToken('u1', 't1', null)).toBe(false);
  });

  it('page d’attente : jamais démarrée au bout d’une minute ⇒ échec sans rien décompter', () => {
    const base: TaskData = { type: 'studio', status: 'en_cours', input: {}, back_path: '/app/studio', result_path: null, error: null, created_at: '2026-11-13T10:00:00Z', started_at: null, finished_at: null };
    const t0 = Date.parse(base.created_at);
    expect(taskView(base, t0 + 10_000).state).toBe('en_cours');
    expect(taskView(base, t0 + 61_000)).toMatchObject({ state: 'echec', error: expect.stringMatching(/Rien n’a été décompté/) });
    expect(taskView({ ...base, started_at: base.created_at }, t0 + 100_000)).toMatchObject({ state: 'en_cours', slow: true });
    expect(taskView({ ...base, status: 'fait', result_path: '/app/studio/x' }).path).toBe('/app/studio/x');
  });
});
