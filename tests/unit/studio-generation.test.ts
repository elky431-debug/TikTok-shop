import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ANGLES, DURATIONS, durationBounds, formatLabel, parseSettings, SCRIPT_FORMATS, TONES, type ScriptSettings } from '@/lib/ai/formats';
import { commercialMentionIssues, ensureCommercialMention, findIssues } from '@/lib/ai/guard';
import { generateMockScripts, timeline } from '@/lib/ai/mock-scripts';
import { buildUserPrompt, FORMAT_GUIDE } from '@/lib/ai/prompt';
import { setScriptModelForTests, type ScriptModel } from '@/lib/ai/providers';
import type { Generation } from '@/lib/ai/schema';
import { validateGeneration } from '@/lib/ai/scripts';
import type { ScriptInput } from '@/lib/ai/types';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { PlanId, Product } from '@/lib/db/types';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { createScripts, getUsageToday, listStudioProducts } from '@/lib/studio';
import { rateScript } from '@/lib/studio/edit';
import { collectFeedback } from '@/lib/studio/feedback';
import { listDocs } from '@/lib/studio/store';
import { parisDate } from '@/lib/utils';

const repo = new LocalRepo(null);
let product: Product;

/** Faux fournisseur d'IA : garde ce qu'il reçoit et répond avec le générateur simulé. */
const seen: ScriptInput[] = [];
const fakeModel: ScriptModel = {
  name: 'openai',
  source: 'openai',
  async generate(input) {
    seen.push(input);
    return generateMockScripts(input, seen.length) as Generation;
  },
  async hook() {
    return { text: 'Regarde bien ce détail.', seconds: 1.3 };
  },
  describeError: () => 'erreur',
};

beforeAll(async () => {
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: parisDate() });
  [product] = await repo.listProducts({ niches: ['beaute'] });
});
afterEach(() => setScriptModelForTests(null));
afterAll(() => setRepoForTests(null));

async function user(id: string, plan: PlanId = 'pro') {
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  return repo.updateProfile(id, { niches: ['beaute'], onboarded_at: new Date().toISOString(), video_style: 'face_camera', plan });
}

function inputFor(p: Product, format: ScriptInput['format'], settings: ScriptSettings): ScriptInput {
  return { product: p, format, style: 'mains', examplePhrase: null, firstName: 'Léa', topVideos: [], settings };
}

describe('point 1 · huit formats', () => {
  it('liste les 8 formats demandés, avec un guide pour l’IA', () => {
    expect(SCRIPT_FORMATS.map((f) => f.id)).toEqual(['demo', 'avant_apres', 'histoire', 'reponse_commentaire', 'unboxing', 'comparaison', 'routine', 'top3']);
    expect(formatLabel('top3')).toBe('Top 3');
    expect(formatLabel('unboxing')).toBe('Déballage');
    for (const f of SCRIPT_FORMATS) expect(FORMAT_GUIDE[f.id]).toBeTruthy();
    expect(FORMAT_GUIDE.comparaison).toMatch(/Aucune marque/);
  });
});

describe('point 2 · réglages (durée, ton, angle)', () => {
  it('lit les réglages d’un formulaire et retombe sur des valeurs sûres', () => {
    expect(parseSettings({ duration: '60', tone: 'humour', angle: 'prix' })).toEqual({ duration: 60, tone: 'humour', angle: 'prix' });
    expect(parseSettings({ duration: '45', tone: 'cri', angle: '' })).toEqual({ duration: 30, tone: 'energique', angle: 'varie' });
    expect(parseSettings({}, { duration: 15, tone: 'calme', angle: 'objection' })).toEqual({ duration: 15, tone: 'calme', angle: 'objection' });
  });

  it('transmet durée, ton et angle à l’IA (message) et les respecte en simulé', () => {
    const prompt = buildUserPrompt(inputFor(product, 'comparaison', { duration: 60, tone: 'expert', angle: 'objection' }));
    expect(prompt).toMatch(/Durée de chaque script : 60 secondes \(entre 40 et 75 s\), 6 à 9 plans/);
    expect(prompt).toMatch(/Ton : Expert/);
    expect(prompt).toMatch(/Angle : Objection levée/);
    expect(prompt).toMatch(/Comparaison :/);
    expect(validateGeneration(generateMockScripts(inputFor(product, 'demo', { duration: 30, tone: 'calme', angle: 'varie' })), 60)[0]).toMatch(/hors de 40–75 s/);
  });

  it('découpe le temps en plans : accroche courte, appel à l’action à la fin', () => {
    expect(timeline(15, 4)).toEqual(['0–2 s', '2–7 s', '7–12 s', '12–15 s']);
    expect(timeline(60, 7).at(-1)).toBe('53–60 s');
  });

  it('chaque combinaison format × durée × ton × angle donne des scripts valides et propres', async () => {
    const products = (await repo.listProducts()).slice(0, 12);
    for (const p of products) {
      for (const f of SCRIPT_FORMATS) {
        for (const duration of DURATIONS) {
          for (const tone of TONES) {
            for (const angle of ANGLES) {
              const out = generateMockScripts(inputFor(p, f.id, { duration, tone: tone.id, angle: angle.id }));
              expect(validateGeneration(out, duration)).toEqual([]);
              const [low, high] = durationBounds(duration).clamp;
              for (const s of out.scripts) {
                expect(s.duration_seconds).toBeGreaterThanOrEqual(low);
                expect(s.duration_seconds).toBeLessThanOrEqual(high);
                expect(s.shots.length).toBeGreaterThanOrEqual(3);
                expect(s.shots.at(-1)!.voice).toMatch(/panier orange/);
                expect(s.shots.at(-1)!.time.endsWith(`${s.duration_seconds} s`)).toBe(true);
                expect(s.broll.length).toBeGreaterThanOrEqual(2);
                expect(s.shots.some((sh) => /\blien\b/i.test(sh.voice))).toBe(false);
              }
            }
          }
        }
      }
    }
  });
});

describe('point 4 · script complet et mention de collaboration commerciale', () => {
  it('le garde-fou repère une mention manquante et la complète, dans chaque langue', () => {
    const bare = { caption: 'Test du jour', hashtags: ['#tiktokshop'], disclosure: '' };
    expect(commercialMentionIssues(bare)).toHaveLength(2);
    const fixed = ensureCommercialMention(bare);
    expect(fixed.hashtags).toEqual(['#publicité', '#tiktokshop']);
    expect(commercialMentionIssues(fixed)).toEqual([]);
    expect(commercialMentionIssues(fixed, 'de')).toHaveLength(2);
    const de = ensureCommercialMention(fixed, 'de');
    expect(de.hashtags[0]).toBe('#Werbung');
    expect(de.disclosure).toMatch(/« Werbung »/);
    // Déjà là (même écrit autrement) : rien n'est ajouté.
    expect(ensureCommercialMention({ caption: 'x', hashtags: ['#Publicite'], disclosure: fixed.disclosure }).hashtags).toEqual(['#Publicite']);
  });

  it('écrit plan par plan : voix, écran, plans de coupe, appel à l’action, légende, hashtags français, mention', async () => {
    setScriptModelForTests(fakeModel);
    const profile = await user('gen-complet');
    const doc = await createScripts(profile, product.id, 'routine', { settings: { duration: 15, tone: 'calme', angle: 'probleme' } });
    expect(seen.at(-1)!.settings).toEqual({ duration: 15, tone: 'calme', angle: 'probleme' });
    expect(doc).toMatchObject({ format: 'routine', source: 'openai', settings: { duration: 15, tone: 'calme', angle: 'probleme' } });
    expect(doc.hooks).toHaveLength(10);
    expect(doc.scripts).toHaveLength(3);
    for (const s of doc.scripts) {
      expect(s.shots.every((sh) => sh.time && sh.visual && sh.voice && sh.on_screen_text)).toBe(true);
      expect(s.broll.length).toBeGreaterThanOrEqual(2);
      expect(s.call_to_action).toBeTruthy();
      expect(s.caption).toBeTruthy();
      expect(s.hashtags[0]).toBe('#publicité');
      expect(s.hashtags.every((h) => /^#[\p{L}0-9]+$/u.test(h))).toBe(true);
      expect(commercialMentionIssues(s)).toEqual([]);
      const texts = [s.caption, s.call_to_action, ...s.broll, ...s.shots.flatMap((sh) => [sh.voice, sh.on_screen_text])];
      expect(texts.flatMap(findIssues)).toEqual([]);
    }
    // La trace dans la table scripts (compteur du formateur) porte le texte complet.
    const row = await repo.getScript(profile.id, doc.script_id!);
    expect(row?.format).toBe('routine');
    expect(row?.full_text).toMatch(/Plans de coupe/);
    expect((await getUsageToday(profile)).used).toBe(1);
  });

  it('applique toujours la limite de scripts du plan gratuit, côté serveur', async () => {
    const profile = await user('gen-gratuit', 'free');
    const { today } = await listStudioProducts(profile);
    for (let i = 0; i < 3; i++) await createScripts(profile, today[0].id, 'top3');
    await expect(createScripts(profile, today[0].id, 'top3')).rejects.toMatchObject({ code: 'limite' });
  });
});

describe('point 8 · notes réutilisées dans les générations suivantes', () => {
  it('valide les notes et garde « a vendu » à part', async () => {
    const profile = await user('note-valide');
    const doc = await createScripts(profile, product.id, 'demo');
    await expect(rateScript(profile, doc.id, 0, { stars: 7 })).rejects.toMatchObject({ code: 'invalide' });
    let rated = await rateScript(profile, doc.id, 0, { stars: 4 });
    rated = await rateScript(profile, doc.id, 0, { sold: 'oui' });
    expect(rated.ratings[0]).toMatchObject({ stars: 4, sold: 'oui' });
    rated = await rateScript(profile, doc.id, 0, { stars: 0, sold: null });
    expect(rated.ratings[0]).toBeNull();
  });

  it('classe les exemples : ceux qui ont vendu, puis les mieux notés ; cite ceux notés 1 ou 2', () => {
    const script = (title: string) => ({ ...generateMockScripts(inputFor(product, 'demo', { duration: 30, tone: 'calme', angle: 'varie' })).scripts[0], title });
    const at = new Date().toISOString();
    const feedback = collectFeedback([
      { format: 'demo', scripts: [script('A'), script('B'), script('C')], ratings: [{ stars: 5, sold: null, at }, { stars: 3, sold: 'oui', at }, { stars: 2, sold: 'non', at }] },
      { format: 'top3', scripts: [script('D')], ratings: [{ stars: 4, sold: null, at }] },
    ]);
    expect(feedback.best.map((b) => b.title)).toEqual(['B', 'A', 'D']);
    expect(feedback.best[0]).toMatchObject({ sold: true, stars: 3 });
    expect(feedback.weak).toEqual([{ title: 'C', stars: 2 }]);
  });

  it('donne au modèle les scripts les mieux notés ou qui ont vendu, et ceux à ne pas refaire', async () => {
    setScriptModelForTests(fakeModel);
    const profile = await user('note-reutilisee');
    const first = await createScripts(profile, product.id, 'avant_apres');
    expect(seen.at(-1)!.feedback).toEqual({ best: [], weak: [] });
    await rateScript(profile, first.id, 1, { stars: 5, sold: 'oui' });
    await rateScript(profile, first.id, 2, { stars: 1 });

    const second = await createScripts(profile, product.id, 'demo');
    const input = seen.at(-1)!;
    expect(input.feedback!.best).toHaveLength(1);
    expect(input.feedback!.best[0]).toMatchObject({ title: first.scripts[1].title, format: 'avant_apres', stars: 5, sold: true });
    expect(input.feedback!.weak).toEqual([{ title: first.scripts[2].title, stars: 1 }]);
    expect(second.feedback_used).toBe(1);
    const prompt = buildUserPrompt(input);
    expect(prompt).toMatch(/Ses scripts qui ont le mieux marché/);
    expect(prompt).toContain(`« ${first.scripts[1].title} » (Avant-après, 5/5, a vendu)`);
    expect(prompt).toMatch(/Ce qui lui a moins plu/);

    // En simulé aussi, l'accroche du script qui a vendu revient parmi les 10.
    setScriptModelForTests(null);
    const third = await createScripts(profile, product.id, 'demo');
    expect(third.hooks.map((h) => h.text)).toContain(first.scripts[1].shots[0].voice);
    expect((await listDocs(profile.id)).length).toBe(3);
  });
});
