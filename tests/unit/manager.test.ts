import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { ensureBoard, saveBoard } from '@/lib/v2/board';
import {
  annualSeries,
  byDay,
  loadManager,
  managerKpis,
  needsFollowUp,
  nextStage,
  SAMPLE_KIND,
  stageOf,
  TRACK_KIND,
  withStatus,
  type SampleData,
} from '@/lib/v2/manager';
import { newBoard } from '@/lib/v2/planning';
import { makeProduct, makeUser } from './v2-fixtures';

let repo: LocalRepo;
beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});
afterEach(() => setRepoForTests(null));

const TODAY = '2026-11-14';

describe('gestionnaire · statuts', () => {
  it('passe d’un statut au suivant, et déduit le statut des vidéos tant qu’on n’en a pas choisi', () => {
    expect(nextStage('a_lancer')).toBe('echantillon_demande');
    expect(nextStage('echantillon_demande')).toBe('echantillon_recu');
    expect(nextStage('echantillon_recu')).toBe('scripts_prets');
    expect(nextStage('en_ligne')).toBe('termine');
    expect(nextStage('termine')).toBe('arrete');
    expect(nextStage('arrete')).toBe('echantillon_demande');
    const board = newBoard({ productId: 'p', productName: 'P' });
    expect(stageOf(null, null)).toBe('a_lancer');
    expect(stageOf(null, board)).toBe('a_lancer');
    expect(stageOf(null, { ...board, items: board.items.map((i) => (i.n === 1 ? { ...i, status: 'tourne' } : i)) })).toBe('en_tournage');
    expect(stageOf(null, { ...board, items: board.items.map((i) => (i.n === 1 ? { ...i, status: 'poste' } : i)) })).toBe('en_ligne');
    expect(stageOf({ product_id: 'p', status: 'arrete', history: [] }, board)).toBe('arrete');
  });

  it('garde l’historique des changements, sans doublon', () => {
    const a = withStatus(null, 'p', 'echantillon_demande', '2026-11-01');
    const b = withStatus(a, 'p', 'echantillon_recu', '2026-11-05');
    expect(b.history.map((h) => h.status)).toEqual(['echantillon_demande', 'echantillon_recu']);
    expect(withStatus(b, 'p', 'echantillon_recu', '2026-11-06')).toBe(b);
  });

  it('signale une demande d’échantillon à relancer après 7 jours sans réponse', () => {
    const base: SampleData = { product_id: 'p', product_name: 'P', requested_at: '2026-11-01', received_at: null, follow_ups: [], note: null };
    expect(needsFollowUp(base, '2026-11-07')).toBe(false);
    expect(needsFollowUp(base, '2026-11-08')).toBe(true);
    expect(needsFollowUp({ ...base, follow_ups: ['2026-11-10'] }, TODAY)).toBe(false);
    expect(needsFollowUp({ ...base, received_at: '2026-11-03' }, TODAY)).toBe(false);
  });
});

describe('gestionnaire · données et chiffres', () => {
  it('réunit produits suivis, vidéos, échantillons et commissions existantes sans les copier', async () => {
    const { id } = await makeUser(repo, 'u1', 'pro');
    const p1 = makeProduct({ id: 'nx-1', name: 'Sérum éclat', price_cents: 2000, commission_rate: 0.2 });
    const p2 = makeProduct({ id: 'nx-2', name: 'Brosse' });
    await repo.upsertProducts([p1, p2]);
    await repo.saveProduct(id, p1.id);
    await repo.saveProduct(id, p2.id);
    const row = (await repo.getSavedProduct(id, p1.id))!;
    const board = await ensureBoard(repo, id, row, p1);
    await saveBoard(repo, id, board, {
      ...board.data,
      items: board.data.items.map((i) => (i.n <= 2 ? { ...i, status: 'poste', posted_at: `2026-11-1${i.n}`, views: 1000 * i.n, sales: i.n, url: null } : i)),
    });
    await repo.saveRecord(id, TRACK_KIND, { product_id: p2.id, status: 'echantillon_demande', history: [] });
    await repo.saveRecord(id, SAMPLE_KIND, {
      product_id: p2.id,
      product_name: 'Brosse',
      requested_at: '2026-11-01',
      received_at: null,
      follow_ups: [],
      note: null,
    });
    // Fiches de l'ancien « Mes gains » : lues telles quelles.
    await repo.saveRecord(id, 'gain', {
      date: '2026-11-12',
      product_name: 'Sérum éclat',
      product_id: p1.id,
      video: null,
      amount_cents: 1250,
      sales: 3,
      source: 'saisie',
    });
    await repo.saveRecord(id, 'gain', {
      date: '2026-03-02',
      product_name: 'Sérum éclat',
      product_id: p1.id,
      video: null,
      amount_cents: 400,
      sales: 1,
      source: 'import',
    });

    const data = await loadManager(repo, id, { today: TODAY, canEarnings: true });
    expect(data.products.map((p) => [p.name, p.stage])).toEqual([
      ['Brosse', 'echantillon_demande'],
      ['Sérum éclat', 'en_ligne'],
    ]);
    const serum = data.products.find((p) => p.id === p1.id)!;
    expect(serum).toMatchObject({ videosPosted: 2, views: 3000, videoSales: 3, commissionsCents: 1650, commissionPerSaleCents: 400 });
    expect(data.videos).toHaveLength(2);
    expect(data.samples[0]).toMatchObject({ product_name: 'Brosse', late: true });
    expect(data.earnings).toHaveLength(2);

    expect(managerKpis(data, '7d', '2026-11', null)).toEqual({ commissionsCents: 1250, sales: 3, videos: 2, samplesPending: 1 });
    expect(managerKpis(data, 'all', '2026-11', null).commissionsCents).toBe(1650);
    expect(managerKpis(data, 'month', '2026-03', p1.id)).toMatchObject({ commissionsCents: 400, videos: 0 });
    const year = annualSeries(data.earnings, 2026, null);
    expect(year[2]).toEqual({ month: 'Mar', commissions: 4, ventes: 1 });
    expect(year[10]).toEqual({ month: 'Nov', commissions: 12.5, ventes: 3 });
    const days = byDay(data, null);
    expect(days['2026-11-12'].commissionsCents).toBe(1250);
    expect(days['2026-11-11'].videos).toHaveLength(1);
    expect(days['2026-11-01'].requested).toHaveLength(1);
  });

  it('sans le suivi des gains (Starter), aucune commission n’est lue', async () => {
    const { id } = await makeUser(repo, 'u2', 'starter');
    await repo.saveRecord(id, 'gain', { date: '2026-11-12', product_name: 'X', product_id: null, video: null, amount_cents: 999, sales: 1, source: 'saisie' });
    const data = await loadManager(repo, id, { today: TODAY, canEarnings: false });
    expect(data.earnings).toEqual([]);
    expect(data.goalCents).toBeNull();
  });
});
