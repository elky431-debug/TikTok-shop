import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setStructuredRunnerForTests } from '@/lib/ai/structured';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { PlanId, Product } from '@/lib/db/types';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { createScripts } from '@/lib/studio';
import { editLine, editsLeft, rewriteScript, translateDocScript, undoScript } from '@/lib/studio/edit';
import { parisDate } from '@/lib/utils';

const repo = new LocalRepo(null);
let product: Product;
beforeAll(async () => {
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: parisDate() });
  [product] = await repo.listProducts({ niches: ['beaute'] });
});
afterEach(() => setStructuredRunnerForTests(null));
afterAll(() => setRepoForTests(null));

async function user(id: string, plan: PlanId) {
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  return repo.updateProfile(id, { niches: ['beaute'], onboarded_at: new Date().toISOString(), video_style: 'face_camera', plan });
}

const words = (s: { shots: Array<{ voice: string }> }) => s.shots.reduce((n, sh) => n + sh.voice.split(/\s+/).length, 0);

describe('point 6 · édition fine', () => {
  it('réécrit une seule ligne, garde la version précédente et revient en arrière', async () => {
    const pro = await user('edit-ligne', 'pro');
    const doc = await createScripts(pro, product.id, 'demo');
    const before = doc.scripts[0];
    const after = await editLine(pro, doc.id, 0, 2);
    expect(after.scripts[0].shots[2].voice).not.toBe(before.shots[2].voice);
    after.scripts[0].shots.forEach((s, i) => i !== 2 && expect(s).toEqual(before.shots[i]));
    expect(after.scripts[1]).toEqual(doc.scripts[1]);
    expect(after).toMatchObject({ edit_count: 1, simulated_edits: 1, versions: [2, 1, 1] });
    expect(after.previous[0]).toEqual(before);
    const undone = await undoScript(pro, doc.id, 0);
    expect(undone.scripts[0]).toEqual(before);
    expect(undone.edit_count).toBe(1); // revenir en arrière ne compte pas
  });

  it('raccourcit (60 → 30 s, moins de mots) et rend plus percutant, mention toujours présente', async () => {
    const pro = await user('edit-court', 'pro');
    const doc = await createScripts(pro, product.id, 'histoire', { settings: { duration: 60, tone: 'calme', angle: 'probleme' } });
    const short = await rewriteScript(pro, doc.id, 0, 'raccourcir');
    expect(short.scripts[0].duration_seconds).toBe(30);
    expect(short.scripts[0].shots.length).toBeLessThanOrEqual(6);
    expect(words(short.scripts[0])).toBeLessThan(words(doc.scripts[0]));
    expect(short.scripts[0].shots.at(-1)!.time.endsWith('30 s')).toBe(true);
    const punchy = await rewriteScript(pro, doc.id, 1, 'percutant');
    expect(punchy.scripts[1].shots[0].voice.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(punchy.scripts[1].shots.every((s) => s.on_screen_text.split(/\s+/).length <= 5)).toBe(true);
    for (const s of punchy.scripts) expect(s.hashtags[0]).toBe('#publicité');
  });

  it('avec l’IA : retire un interdit resté après le nouvel essai, garde le reste', async () => {
    const pro = await user('edit-ia', 'pro');
    const doc = await createScripts(pro, product.id, 'demo');
    const prompts: string[] = [];
    setStructuredRunnerForTests(async (request) => {
      prompts.push(request.prompt);
      return { voice: 'Regarde ce détail. C’est un miracle.', on_screen_text: 'Le détail' } as never;
    });
    const out = await editLine(pro, doc.id, 1, 1);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/ne respectait pas les règles/);
    expect(out.scripts[1].shots[1]).toMatchObject({ voice: 'Regarde ce détail.', on_screen_text: 'Le détail' });
    expect(out.simulated_edits).toBe(0);
  });

  it('limite les retouches par génération selon le plan', async () => {
    const free = await user('edit-limite', 'free');
    const [first] = await repo.listProducts({ niches: ['beaute'] });
    const doc = await createScripts(free, first.id, 'demo');
    for (let i = 0; i < 5; i++) await editLine(free, doc.id, 0, 1);
    const last = await repo.getRecord<{ edit_count: number }>(free.id, doc.id);
    expect(editsLeft(free, last!.data)).toBe(0);
    await expect(rewriteScript(free, doc.id, 0, 'percutant')).rejects.toMatchObject({ code: 'retouches' });
  });

  it('traduit pour l’Allemagne, l’Italie, l’Espagne en Pro+ seulement, avec la mention locale', async () => {
    const pro = await user('trad-pro', 'pro');
    const proDoc = await createScripts(pro, product.id, 'demo');
    await expect(translateDocScript(pro, proDoc.id, 0, 'de')).rejects.toMatchObject({ code: 'plan' });

    const plus = await user('trad-plus', 'proplus');
    const doc = await createScripts(plus, product.id, 'demo');
    setStructuredRunnerForTests(async () => ({
      title: 'Die schnelle Demo',
      shots: doc.scripts[0].shots.map((_, i) => ({ voice: `Satz ${i + 1} auf Deutsch.`, on_screen_text: `Text ${i + 1}` })),
      call_to_action: 'Er ist im orangefarbenen Warenkorb.',
      caption: 'Test des Tages',
      hashtags: ['tiktokshop', '#schönheit'],
    }) as never);
    const de = await translateDocScript(plus, doc.id, 0, 'de');
    const t = de.translations[0].de!;
    expect(t).toMatchObject({ lang: 'de', simulated: false, version: 1 });
    expect(t.script.shots[0].voice).toBe('Satz 1 auf Deutsch.');
    expect(t.script.shots[0].visual).toBe(doc.scripts[0].shots[0].visual); // les indications restent en français
    expect(t.script.hashtags).toEqual(['#Werbung', '#tiktokshop', '#schönheit']);
    expect(t.script.disclosure).toMatch(/« Werbung »/);
    expect(de.scripts[0]).toEqual(doc.scripts[0]);

    // Sans clé : traduction simulée, signalée ; retoucher le script la rend « à refaire ».
    setStructuredRunnerForTests(null);
    const italian = await translateDocScript(plus, doc.id, 0, 'it');
    expect(italian.translations[0].it).toMatchObject({ simulated: true });
    expect(italian.translations[0].it!.script.hashtags[0]).toBe('#pubblicità');
    const edited = await editLine(plus, doc.id, 0, 1);
    expect(edited.translations[0].de!.version).not.toBe(edited.versions[0]);
  });
});
