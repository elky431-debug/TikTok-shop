import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateMockScripts } from '@/lib/ai/mock-scripts';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { PlanId, Product } from '@/lib/db/types';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { createScripts, deleteGeneration, setScriptSaved, studioRights } from '@/lib/studio';
import { rateScript } from '@/lib/studio/edit';
import { docScriptText, docToPdf, docToText } from '@/lib/studio/export';
import { buildPdf, pdfString, textWidth, toWinAnsi, wrapText } from '@/lib/studio/pdf';
import { getDoc, listHistory } from '@/lib/studio/store';
import { parisDate } from '@/lib/utils';

const repo = new LocalRepo(null);
let product: Product;
beforeAll(async () => {
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: parisDate() });
  [product] = await repo.listProducts({ niches: ['beaute'] });
});
afterAll(() => setRepoForTests(null));

async function user(id: string, plan: PlanId) {
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  return repo.updateProfile(id, { niches: ['beaute'], onboarded_at: new Date().toISOString(), video_style: 'face_camera', plan });
}

/** Vérifie la structure d'un PDF : en-tête, fin, et table des positions qui pointe bien sur chaque objet. */
function checkPdf(bytes: Uint8Array): string {
  const text = Buffer.from(bytes).toString('latin1');
  expect(text.startsWith('%PDF-1.4\n')).toBe(true);
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
  expect(text.slice(startxref, startxref + 4)).toBe('xref');
  const entries = text.slice(startxref).split('\n').slice(3).filter((l) => / 00000 n $/.test(l));
  entries.forEach((line, i) => expect(text.slice(Number(line.slice(0, 10)), Number(line.slice(0, 10)) + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index! + m[0].length;
    expect(text.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream');
  }
  return text;
}

describe('point 9 · historique, favoris, export texte et PDF', () => {
  it('l’export est réservé à Elite (droit vérifié côté serveur)', () => {
    expect(studioRights('aucun').export).toBe(false);
    expect(studioRights('starter').export).toBe(false);
    expect(studioRights('pro').export).toBe(false);
    expect(studioRights('elite').export).toBe(true);
  });

  it('PDF sans dépendance : accents en WinAnsi, retour à la ligne, plusieurs pages, positions exactes', () => {
    expect(toWinAnsi('é’€…œ 12 € 🙂→')).toEqual([0xe9, 0x92, 0x80, 0x85, 0x9c, 0x20, 0x31, 0x32, 0xa0, 0x80, 0x20, 0x2d, 0x3e]);
    expect(pdfString(toWinAnsi('(Été) \\'))).toBe('(\\(\\311t\\351\\) \\\\)');
    for (const line of wrapText('mot '.repeat(200), 12, false, 300)) expect(textWidth(line, 12)).toBeLessThanOrEqual(300);
    const long = Array.from({ length: 120 }, (_, i) => ({ text: `Ligne ${i + 1} : c’est dans le panier orange, juste en dessous.`, size: 12 }));
    const text = checkPdf(buildPdf(long, { title: 'Essai', footer: 'Test', date: new Date('2026-11-12T10:00:00Z') }));
    expect(Number(/\/Count (\d+)/.exec(text)![1])).toBeGreaterThan(1);
    expect(text).toContain('page 2/');
  });

  it('exporte une génération entière ou un script, avec toutes ses parties', async () => {
    const plus = await user('export-elite', 'elite');
    const doc = await createScripts(plus, product.id, 'comparaison');
    const all = docToText(doc);
    for (const part of ['ACCROCHES', 'SCRIPT 3', 'On voit :', 'Dis : «', 'À l’écran :', 'Plans de coupe :', 'Appel à l’action :', 'Légende :', '#publicité', 'Collaboration commerciale']) {
      expect(all).toContain(part);
    }
    expect(docScriptText(doc, 1)).toContain(`SCRIPT 2 : ${doc.scripts[1].title}`);
    expect(docScriptText(doc, 1, 'de')).toBeNull(); // pas encore traduit
    const pdf = checkPdf(docToPdf(doc)!);
    expect(pdf).toContain('/BaseFont /Helvetica-Bold');
    expect(pdf).toContain(pdfString(toWinAnsi(doc.scripts[0].title)).slice(1, -1));
    checkPdf(docToPdf(doc, { index: 2 })!);
    expect(docToPdf(doc, { index: 1, lang: 'es' })).toBeNull();
  });

  it('historique : favoris, notes, « a vendu », suppression complète', async () => {
    const pro = await user('historique', 'pro');
    const a = await createScripts(pro, product.id, 'demo');
    const b = await createScripts(pro, product.id, 'routine', { settings: { duration: 60, tone: 'humour', angle: 'prix' } });
    await setScriptSaved(pro, a.id, true);
    await rateScript(pro, b.id, 2, { stars: 4, sold: 'oui' });
    const history = await listHistory(pro.id);
    expect(history.map((h) => h.id)).toEqual([b.id, a.id]);
    expect(history[0]).toMatchObject({ format: 'routine', settings: { duration: 60 }, stars: 4, sold: true, saved: false });
    expect(history[1]).toMatchObject({ saved: true, sold: false });
    expect((await repo.getScript(pro.id, a.script_id!))?.saved).toBe(true); // la trace suit le favori

    await deleteGeneration(pro, a.id);
    expect(await getDoc(pro.id, a.id)).toBeNull();
    expect(await repo.getScript(pro.id, a.script_id!)).toBeNull();
    expect((await listHistory(pro.id)).map((h) => h.id)).toEqual([b.id]);
  });

  it('reprend une génération d’avant la session 5 à sa première ouverture, une seule fois', async () => {
    const pro = await user('ancien', 'pro');
    const old = generateMockScripts({ product, format: 'unboxing', style: null, examplePhrase: null, firstName: null, topVideos: [] });
    const row = await repo.insertScript({
      user_id: pro.id,
      product_id: product.id,
      format: 'unboxing',
      hooks: old.hooks,
      script: old.scripts.map(({ broll: _b, ...s }) => s),
      full_text: 'ancien texte',
      source: 'simulation',
      saved: true,
      regen_count: 2,
    });
    expect((await listHistory(pro.id))[0]).toMatchObject({ id: row.id, settings: null, saved: true });
    const adopted = (await getDoc(pro.id, row.id))!;
    expect(adopted).toMatchObject({ legacy: true, script_id: row.id, format: 'unboxing', regen_count: 2, saved: true });
    expect(adopted.id).not.toBe(row.id);
    expect(adopted.scripts[0].broll.length).toBeGreaterThan(0);
    expect(adopted.scripts[0].hashtags[0]).toBe('#publicité');
    expect((await getDoc(pro.id, row.id))!.id).toBe(adopted.id);
    expect((await listHistory(pro.id)).map((h) => h.id)).toEqual([adopted.id]);
  });
});
