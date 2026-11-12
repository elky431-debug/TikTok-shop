import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import {
  attachProducts,
  earningsDashboard,
  earningsToCsv,
  goalProgress,
  guessMapping,
  mappingFits,
  parseDate,
  parseEarningsCsv,
  parseFormat,
  parseNiche,
  readCsv,
  type EarningData,
} from '@/lib/v2/earnings';
import { forgetMapping, getEarningsGoal, getMapping, importEarnings, saveMapping, setEarningsGoal } from '@/lib/v2/earnings-store';
import { makeProduct, makeUser } from './v2-fixtures';

let repo: LocalRepo;
beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});
afterEach(() => setRepoForTests(null));

const e = (o: Partial<EarningData>): EarningData => ({
  date: '2026-11-12', product_name: 'Sérum', product_id: null, video: null, amount_cents: 1000, sales: null, source: 'saisie', ...o,
});

describe('bloc 6.1 · saisie et import CSV avec choix des colonnes', () => {
  it('saisie par vidéo ou par produit : produit suivi reconnu par son nom, niche reprise', () => {
    const [video, whole] = attachProducts(
      [e({ product_name: ' sérum ÉCLAT ', video: 'Vidéo 3' }), e({ product_name: 'Autre chose' })],
      [{ id: 'p1', name: 'Sérum éclat', niche: 'beaute' }],
    );
    expect(video).toMatchObject({ product_id: 'p1', niche: 'beaute', video: 'Vidéo 3' });
    expect(whole).toMatchObject({ product_id: null, video: null });
    expect(whole.niche).toBeUndefined();
    expect(parseFormat('Avant-après')).toBe('avant_apres');
    expect(parseFormat('demo')).toBe('demo');
    expect(parseFormat('Déballage')).toBe('unboxing');
    expect(parseFormat('n’importe quoi')).toBeNull();
    expect(parseNiche('Beauté')).toBe('beaute');
    expect(parseNiche('Maison et cuisine')).toBe('maison');
    expect(parseDate('31/02/2026')).toBeNull();
  });

  it('colonnes aux noms inconnus : l’utilisateur les choisit, puis la correspondance est mémorisée', async () => {
    const csv = 'Jour de vente;Article vendu;Gain net;Clip;Type\n12/11/2026;Sérum éclat;12,50 €;Vidéo 1;Avant-après\n13/11/2026;Gourde;3,20;;Démo';
    const table = readCsv(csv);
    expect(table.headers).toEqual(['Jour de vente', 'Article vendu', 'Gain net', 'Clip', 'Type']);
    expect(guessMapping(table.headers)).toEqual({});
    expect(parseEarningsCsv(csv).errors[0]).toMatch(/Colonnes introuvables/);

    const mapping = { date: 'Jour de vente', product_name: 'Article vendu', amount_cents: 'Gain net', video: 'Clip', format: 'Type' };
    const result = parseEarningsCsv(csv, mapping);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { date: '2026-11-12', product_name: 'Sérum éclat', product_id: null, video: 'Vidéo 1', amount_cents: 1250, sales: null, source: 'import', format: 'avant_apres' },
      { date: '2026-11-13', product_name: 'Gourde', product_id: null, video: null, amount_cents: 320, sales: null, source: 'import', format: 'demo' },
    ]);

    await makeUser(repo, 'u');
    expect(await getMapping(repo, 'u')).toBeNull();
    await saveMapping(repo, 'u', mapping, table.headers);
    await saveMapping(repo, 'u', mapping, table.headers);
    const memorized = await getMapping(repo, 'u');
    expect(memorized?.data.mapping).toEqual(mapping);
    expect(await repo.listRecords('u', 'import_csv')).toHaveLength(1);
    expect(mappingFits(memorized!.data.mapping, table.headers)).toBe(true);
    expect(mappingFits(memorized!.data.mapping, ['Date', 'Produit', 'Montant'])).toBe(false);
    expect(mappingFits({ date: 'Jour de vente' }, table.headers)).toBe(false);
    await forgetMapping(repo, 'u');
    expect(await getMapping(repo, 'u')).toBeNull();
  });

  it('un relevé importé deux fois n’est compté qu’une fois ; les lignes rejoignent les produits suivis', async () => {
    await makeUser(repo, 'u');
    await repo.upsertProducts([makeProduct({ id: 'p1', name: 'Sérum éclat', niche: 'beaute' })]);
    await repo.saveProduct('u', 'p1');
    const rows = parseEarningsCsv('Date;Produit;Montant\n12/11/2026;Sérum éclat;12,50\n12/11/2026;Gourde;5').rows;
    expect(await importEarnings(repo, 'u', rows)).toEqual({ added: 2, duplicates: 0 });
    expect(await importEarnings(repo, 'u', rows)).toEqual({ added: 0, duplicates: 2 });
    const saved = await repo.listRecords<EarningData>('u', 'gain');
    expect(saved.find((r) => r.data.product_name === 'Sérum éclat')?.data).toMatchObject({ product_id: 'p1', niche: 'beaute' });
  });
});

describe('bloc 6.2 · tableau de bord', () => {
  const entries = [
    e({ date: '2026-11-12', product_name: 'Sérum', video: 'v1', amount_cents: 1000, format: 'demo', niche: 'beaute' }),
    e({ date: '2026-11-11', product_name: 'Sérum', video: 'v2', amount_cents: 500, format: 'avant_apres', niche: 'beaute' }),
    e({ date: '2026-11-03', product_name: 'Gourde', video: null, amount_cents: 800, niche: 'maison' }),
    e({ date: '2026-10-20', product_name: 'Gourde', video: 'v9', amount_cents: 300, format: 'demo', niche: 'maison' }),
  ];

  it('gains par jour, semaine et mois', () => {
    const board = earningsDashboard(entries, '2026-11-12');
    expect(board.byDay).toHaveLength(14);
    expect(board.byDay.at(-1)).toEqual({ date: '2026-11-12', cents: 1000 });
    expect(board.byDay.at(-2)).toEqual({ date: '2026-11-11', cents: 500 });
    expect(board.byWeek.at(-1)).toEqual({ start: '2026-11-09', cents: 1500 });
    expect(board.byMonth.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(board.byMonth.slice(-2)).toEqual([{ month: '2026-10', cents: 300 }, { month: '2026-11', cents: 2300 }]);
    expect(board.monthCents).toBe(2300);
  });

  it('par produit, par format, par niche ; meilleur produit, meilleur format, gain moyen par vidéo', () => {
    const board = earningsDashboard(entries, '2026-11-12');
    expect(board.byProduct.map((p) => [p.name, p.cents])).toEqual([['Sérum', 1500], ['Gourde', 1100]]);
    expect(board.byFormat).toEqual([
      { key: 'demo', label: 'Démo face caméra', cents: 1300 },
      { key: 'avant_apres', label: 'Avant-après', cents: 500 },
    ]);
    expect(board.byNiche.map((n) => [n.key, n.cents])).toEqual([['beaute', 1500], ['maison', 1100]]);
    expect(board.bestProduct).toEqual({ name: 'Sérum', cents: 1500 });
    expect(board.bestFormat).toEqual({ format: 'demo', label: 'Démo face caméra', cents: 1300 });
    // 3 vidéos notées (v1, v2, v9) pour 1 800 centimes ; la ligne sans vidéo n'entre pas dans la moyenne.
    expect(board.averagePerVideoCents).toBe(600);
    expect(earningsDashboard([e({ video: null })], '2026-11-12').averagePerVideoCents).toBeNull();
  });
});

describe('bloc 6.3 · objectif mensuel', () => {
  it('barre de progression plafonnée, objectif réglable et retirable', async () => {
    expect(goalProgress(15000, 30000)).toEqual({ ratio: 0.5, leftCents: 15000 });
    expect(goalProgress(45000, 30000)).toEqual({ ratio: 1, leftCents: 0 });
    expect(goalProgress(1000, null)).toBeNull();
    await makeUser(repo, 'u');
    await setEarningsGoal(repo, 'u', 30000);
    await setEarningsGoal(repo, 'u', 40000);
    expect((await getEarningsGoal(repo, 'u')).cents).toBe(40000);
    expect(await repo.listRecords('u', 'objectif_gains')).toHaveLength(1);
    await setEarningsGoal(repo, 'u', 0);
    expect((await getEarningsGoal(repo, 'u')).cents).toBeNull();
  });
});

describe('bloc 6.4 · export CSV pour la comptabilité', () => {
  it('séparateur « ; », virgule décimale, total, formules neutralisées et mention « aucun conseil fiscal »', () => {
    const csv = earningsToCsv([
      e({ date: '2026-11-12', product_name: '=HYPERLINK("x")', video: 'v1', amount_cents: 1250, sales: 3, format: 'demo', niche: 'beaute' }),
      e({ date: '2026-11-01', product_name: 'Gourde; inox', amount_cents: 500, source: 'import' }),
    ]);
    const lines = csv.split('\r\n');
    expect(csv.startsWith('﻿Date;Produit;Vidéo;Format;Niche;Ventes;Montant (EUR);Origine')).toBe(true);
    expect(lines[1]).toBe('2026-11-01;"Gourde; inox";;;;;5,00;import');
    expect(lines[2]).toBe(`2026-11-12;"'=HYPERLINK(""x"")";v1;Démo face caméra;Beauté;3;12,50;saisie`);
    expect(lines[3]).toBe('Total;;;;;;17,50;');
    expect(csv).toMatch(/Aucun conseil fiscal/);
  });
});
