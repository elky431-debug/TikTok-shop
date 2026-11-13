import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SCRIPT_FORMATS } from '@/lib/ai/formats';
import { findIssues, stripIssues } from '@/lib/ai/guard';
import { generateMockScripts } from '@/lib/ai/mock-scripts';
import { validateGeneration } from '@/lib/ai/scripts';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { refreshCatalog } from '@/lib/jobs/refresh';
import type { PlanId } from '@/lib/db/types';
import { SAFETY_CAPS } from '@/lib/plans';
import { createScripts, getUsageToday, listStudioProducts, regenerateHookAt, StudioError } from '@/lib/studio';
import { allowedFormats } from '@/lib/studio/limits';
import { parisDate } from '@/lib/utils';

const repo = new LocalRepo(null);

beforeAll(async () => {
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: parisDate() });
});
afterAll(() => setRepoForTests(null));

describe('garde-fou des scripts', () => {
  it('repère promesses médicales, superlatifs et gains', () => {
    expect(findIssues('Ce sérum guérit l’acné')).not.toHaveLength(0);
    expect(findIssues('Le meilleur produit du monde')).not.toHaveLength(0);
    expect(findIssues('Un effet miracle')).not.toHaveLength(0);
    expect(findIssues('Gagne 1000 € par mois')).not.toHaveLength(0);
    expect(findIssues('Ma commission est énorme')).not.toHaveLength(0);
    expect(findIssues('Résultat garanti')).not.toHaveLength(0);
    expect(findIssues('C’est dans le panier orange, juste en dessous.')).toHaveLength(0);
    expect(findIssues('Le meilleur moment pour l’utiliser, c’est le soir.')).toHaveLength(0);
  });

  it('retire seulement les phrases fautives', () => {
    expect(stripIssues('Regarde la texture. C’est un miracle. Lien en dessous.')).toBe('Regarde la texture. Lien en dessous.');
  });
});

describe('générateur simulé', () => {
  it('respecte le format et les règles pour tous les produits et formats', async () => {
    const products = await repo.listProducts();
    for (const product of products) {
      for (const format of SCRIPT_FORMATS) {
        const out = generateMockScripts({
          product,
          format: format.id,
          style: 'face_camera',
          examplePhrase: 'Les filles, faut que je vous montre un truc.',
          firstName: 'Léa',
          topVideos: product.top_videos,
        });
        expect(out.hooks).toHaveLength(10);
        expect(out.scripts).toHaveLength(3);
        for (const hook of out.hooks) expect(hook.seconds).toBeLessThan(3);
        for (const s of out.scripts) {
          expect(s.duration_seconds).toBeGreaterThanOrEqual(20);
          expect(s.duration_seconds).toBeLessThanOrEqual(40);
          expect(s.disclosure).toMatch(/#publicité/);
          expect(s.shots.at(-1)!.voice).toMatch(/panier orange/);
        }
        expect(validateGeneration(out)).toEqual([]);
      }
    }
  });
});

describe('studio et limites du plan', () => {
  async function member(id: string, plan: PlanId = 'starter') {
    await repo.ensureProfile({ id, email: `${id}@test.fr` });
    return repo.updateProfile(id, { niches: ['beaute'], onboarded_at: new Date().toISOString(), video_style: 'mains', plan });
  }

  it('applique 10 scripts par jour en Starter, côté serveur', async () => {
    const profile = await member('studio-starter');
    const [first] = await repo.listProducts({ niches: ['beaute'] });
    for (let i = 0; i < 10; i++) {
      const record = await createScripts(profile, first.id, 'demo');
      expect(record.source).toBe('simulation');
      expect(record.hooks).toHaveLength(10);
    }
    await expect(createScripts(profile, first.id, 'demo')).rejects.toMatchObject({
      code: 'limite',
      message: expect.stringContaining('Tu as écrit tes 10 scripts du jour (plan Starter)'),
    });
    expect(await getUsageToday(profile)).toMatchObject({ used: 10, limit: 10, remaining: 0 });
  });

  it('Elite : « illimité », mais un plafond de sécurité côté serveur, jamais chiffré dans le message', async () => {
    const profile = await member('studio-elite', 'elite');
    const [first] = await repo.listProducts({ niches: ['beaute'] });
    const day = parisDate();
    for (let i = 0; i < SAFETY_CAPS.scriptsPerDay - 1; i++) await repo.incrementUsage(profile.id, day, -1);
    expect((await createScripts(profile, first.id, 'top3')).hooks).toHaveLength(10);
    const refused = await createScripts(profile, first.id, 'demo').catch((e: unknown) => e);
    expect(refused).toMatchObject({ code: 'limite', message: expect.stringContaining('Limite de sécurité du jour atteinte') });
    expect((refused as Error).message).not.toMatch(/\d/);
  });

  it('refuse en Starter un format réservé à Pro (les 5 premiers seulement), sans consommer de crédit', async () => {
    const profile = await member('studio-formats');
    const [first] = await repo.listProducts({ niches: ['beaute'] });
    expect(allowedFormats('starter')).toEqual(SCRIPT_FORMATS.slice(0, 5).map((f) => f.id));
    expect(allowedFormats('pro')).toEqual(SCRIPT_FORMATS.map((f) => f.id));
    expect(allowedFormats('elite')).toHaveLength(8);
    expect(allowedFormats('aucun')).toEqual([]);
    for (const format of ['comparaison', 'routine', 'top3'] as const) {
      expect(allowedFormats('starter')).not.toContain(format);
      await expect(createScripts(profile, first.id, format)).rejects.toMatchObject({
        code: 'plan',
        message: 'Ce format est inclus à partir du plan Pro.',
      });
    }
    expect((await getUsageToday(profile)).used).toBe(0);
    expect((await createScripts(profile, first.id, 'unboxing')).format).toBe('unboxing');
    const pro = await member('studio-formats-pro', 'pro');
    expect((await createScripts(pro, first.id, 'top3')).format).toBe('top3');
  });

  it('sans abonnement : aucun produit à écrire, aucun crédit consommé', async () => {
    const profile = await member('studio-aucun', 'aucun');
    const products = await repo.listProducts({ niches: ['beaute'] });
    for (const product of [products[0], products[20]]) {
      await expect(createScripts(profile, product.id, 'demo')).rejects.toBeInstanceOf(StudioError);
      await expect(createScripts(profile, product.id, 'demo')).rejects.toMatchObject({ code: 'acces' });
    }
    expect((await getUsageToday(profile)).used).toBe(0);
    expect(await listStudioProducts(profile)).toMatchObject({ today: [] });
  });

  it('un abonné Starter écrit sur n’importe quel produit du radar', async () => {
    const profile = await member('studio-acces');
    const products = await repo.listProducts({ niches: ['beaute'] });
    expect((await createScripts(profile, products[20].id, 'demo')).product_id).toBe(products[20].id);
  });

  it('limite les accroches régénérées à 5 par script', async () => {
    const profile = await member('studio-regen');
    const [first] = await repo.listProducts({ niches: ['beaute'] });
    const record = await createScripts(profile, first.id, 'avant_apres');
    let current = record;
    for (let i = 0; i < 5; i++) {
      const before = current.hooks[0].text;
      current = await regenerateHookAt(profile, record.id, 0);
      expect(current.hooks[0].text).not.toBe(before);
    }
    await expect(regenerateHookAt(profile, record.id, 0)).rejects.toMatchObject({ code: 'regeneration' });
  });

  it('rend le crédit si la génération échoue', async () => {
    const profile = await member('studio-echec');
    const [first] = await repo.listProducts({ niches: ['beaute'] });
    const ai = await import('@/lib/ai/scripts');
    const spy = vi.spyOn(ai, 'generateScripts').mockRejectedValueOnce(new ai.ScriptGenerationError('panne'));
    await expect(createScripts(profile, first.id, 'demo')).rejects.toMatchObject({ code: 'generation' });
    expect((await getUsageToday(profile)).used).toBe(0);
    spy.mockRestore();
  });
});
