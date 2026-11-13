import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateMockScripts } from '@/lib/ai/mock-scripts';
import { buildUserPrompt } from '@/lib/ai/prompt';
import { setScriptModelForTests, type ScriptModel } from '@/lib/ai/providers';
import type { Generation } from '@/lib/ai/schema';
import { setStructuredRunnerForTests } from '@/lib/ai/structured';
import { cleanSamples, recurringExpressions, simulateStyle } from '@/lib/ai/style';
import type { ScriptInput } from '@/lib/ai/types';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { PlanId } from '@/lib/db/types';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { createScripts } from '@/lib/studio';
import { activeStyle, analyzeAndSaveStyle, deleteStyle, getStyle, setStyleEnabled, styleAnalysesLeft, updateStyleProfile } from '@/lib/studio/style';
import { KIND_STYLE_LOG } from '@/lib/studio/types';
import { parisDate } from '@/lib/utils';

const repo = new LocalRepo(null);
beforeAll(async () => {
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: parisDate() });
});
afterEach(() => {
  setStructuredRunnerForTests(null);
  setScriptModelForTests(null);
});
afterAll(() => setRepoForTests(null));

async function user(id: string, plan: PlanId) {
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  return repo.updateProfile(id, { niches: ['beaute'], onboarded_at: new Date().toISOString(), video_style: 'face_camera', plan });
}

const SAMPLES = [
  'Franchement les filles, regarde ça. Je l’ai reçu ce matin et je teste direct devant toi ! Le panier orange est juste en dessous.',
  'Franchement les filles, je ne pensais pas l’aimer autant. Regarde la texture, tu vois ? Dis-moi en commentaire si tu veux la suite !',
  'Petit test du soir. Franchement les filles, c’est simple, tu l’ouvres et tu l’utilises comme ça. Je te mets tout en dessous.',
];

describe('point 3 · style personnel', () => {
  it('nettoie les textes collés : trop courts et doublons retirés, 5 au plus', () => {
    const many = [...SAMPLES, SAMPLES[0], 'trop court', ...SAMPLES.map((s) => `${s} Encore.`), 'Un sixième texte assez long pour compter dans l’analyse du style.'];
    const clean = cleanSamples(many);
    expect(clean).toHaveLength(5);
    expect(clean).not.toContain('trop court');
    expect(new Set(clean).size).toBe(5);
  });

  it('sans IA : une vraie analyse du texte (tutoiement, expressions qui reviennent, débuts, fins)', () => {
    expect(recurringExpressions(SAMPLES)).toContain('franchement les filles');
    const style = simulateStyle(SAMPLES);
    expect(style.address).toBe('tutoiement');
    expect(style.expressions[0]).toBe('franchement les filles');
    expect(style.openings).toHaveLength(3);
    expect(style.closings[0]).toMatch(/panier orange/);
    expect(style.summary).toMatch(/sans IA/);
  });

  it('réservé à Pro et Pro+, au moins 3 textes, quota d’analyses par jour', async () => {
    const free = await user('style-gratuit', 'free');
    await expect(analyzeAndSaveStyle(free, SAMPLES)).rejects.toMatchObject({ code: 'plan' });

    const pro = await user('style-pro', 'pro');
    await expect(analyzeAndSaveStyle(pro, SAMPLES.slice(0, 2))).rejects.toMatchObject({ code: 'invalide' });
    const saved = await analyzeAndSaveStyle(pro, SAMPLES);
    expect(saved.data).toMatchObject({ enabled: true, simulated: true, samples: SAMPLES });
    for (let i = 0; i < 4; i++) await analyzeAndSaveStyle(pro, SAMPLES);
    expect(await styleAnalysesLeft(pro)).toBe(0);
    await expect(analyzeAndSaveStyle(pro, SAMPLES)).rejects.toMatchObject({ code: 'quota' });
    // Une seule fiche de style, remplacée à chaque analyse.
    expect(await repo.listRecords(pro.id, 'style_perso')).toHaveLength(1);
  });

  it('avec l’IA : profil nettoyé (aucun interdit, aucune expression trop longue), marqué comme réel', async () => {
    setStructuredRunnerForTests(async () => ({
      summary: 'Tu parles vite et tu tutoies.',
      tone: 'direct',
      sentence_length: 'courtes',
      address: 'tutoiement',
      expressions: ['franchement les filles', 'le meilleur produit du monde', 'franchement les filles'],
      openings: ['Regarde ça.'],
      closings: ['Le panier orange est juste en dessous.'],
      do: ['Phrases courtes.'],
      avoid: [],
    }) as never);
    const pro = await user('style-ia', 'pro');
    const saved = await analyzeAndSaveStyle(pro, SAMPLES);
    expect(saved.data.simulated).toBe(false);
    expect(saved.data.profile.expressions).toEqual(['franchement les filles']);
  });

  it('modifiable, en pause, supprimable ; l’analyse reste comptée après suppression', async () => {
    const pro = await user('style-edition', 'pro');
    await analyzeAndSaveStyle(pro, SAMPLES);
    const edited = await updateStyleProfile(pro, {
      summary: 'Ton direct.',
      tone: 'complice',
      expressions: 'franchement\nle meilleur du monde\nregarde ça',
      openings: 'Regarde ça.',
      closings: 'Je te mets tout en dessous.',
      do: 'Phrases courtes',
      avoid: '',
    });
    expect(edited.data.profile).toMatchObject({ summary: 'Ton direct.', tone: 'complice', expressions: ['franchement', 'regarde ça'] });
    expect(edited.data.edited_at).not.toBeNull();

    await setStyleEnabled(pro, false);
    expect(await activeStyle(pro)).toBeNull();
    await setStyleEnabled(pro, true);
    expect(await activeStyle(pro)).not.toBeNull();

    await deleteStyle(pro);
    expect(await getStyle(pro.id)).toBeNull();
    expect(await repo.listRecords(pro.id, KIND_STYLE_LOG)).toHaveLength(1);
    expect(await styleAnalysesLeft(pro)).toBe(4);
  });

  it('est réutilisé à chaque génération (message de l’IA et générateur simulé)', async () => {
    const seen: ScriptInput[] = [];
    const model: ScriptModel = {
      name: 'anthropic',
      source: 'claude',
      async generate(input) {
        seen.push(input);
        return generateMockScripts(input) as Generation;
      },
      async hook() {
        return null;
      },
      describeError: () => 'erreur',
    };
    const pro = await user('style-generation', 'pro');
    await analyzeAndSaveStyle(pro, SAMPLES);
    const [product] = await repo.listProducts({ niches: ['beaute'] });

    setScriptModelForTests(model);
    const doc = await createScripts(pro, product.id, 'demo');
    expect(doc.personal_style).toBe(true);
    expect(seen[0].personalStyle?.expressions).toContain('franchement les filles');
    expect(buildUserPrompt(seen[0])).toMatch(/Style personnel du créateur[\s\S]*« franchement les filles »/);

    setScriptModelForTests(null);
    const simulated = await createScripts(pro, product.id, 'demo');
    const voices = simulated.scripts.flatMap((s) => s.shots.map((sh) => sh.voice)).join(' ');
    expect(voices).toMatch(/Franchement les filles\./);

    // En pause : plus utilisé.
    await setStyleEnabled(pro, false);
    setScriptModelForTests(model);
    await createScripts(pro, product.id, 'demo');
    expect(seen.at(-1)!.personalStyle).toBeNull();
  });
});
