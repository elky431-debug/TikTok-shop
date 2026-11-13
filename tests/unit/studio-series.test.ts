import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FIXED_ANGLES, SCRIPT_FORMATS } from '@/lib/ai/formats';
import { dedupeAngles, generateSeries, isDuplicateAngle, SERIES_SIZE, similarity, simulateSeries, type SeriesAngle } from '@/lib/ai/series';
import { setStructuredRunnerForTests } from '@/lib/ai/structured';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { PlanId, Product } from '@/lib/db/types';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { getUsageToday } from '@/lib/studio';
import { isUnlimited, SAFETY_CAPS } from '@/lib/plans';
import { createSeries, listSeries, seriesLeft, writeFromAngle, writtenAngles } from '@/lib/studio/series';
import { KIND_SERIES } from '@/lib/studio/types';
import { parisDate } from '@/lib/utils';

const repo = new LocalRepo(null);
let product: Product;
beforeAll(async () => {
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: parisDate() });
  [product] = await repo.listProducts({ niches: ['maison'] });
});
afterEach(() => setStructuredRunnerForTests(null));
afterAll(() => setRepoForTests(null));

async function user(id: string, plan: PlanId) {
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  return repo.updateProfile(id, { niches: ['maison'], onboarded_at: new Date().toISOString(), video_style: 'mains', plan });
}

const angle = (title: string, hook: string, extra: Partial<SeriesAngle> = {}): SeriesAngle => ({
  title,
  hook,
  format: 'demo',
  angle: 'probleme',
  pitch: 'Tu montres le produit en action.',
  ...extra,
});

describe('point 5 · série de 20 vidéos sans répétition', () => {
  it('repère les doublons à quelques mots près (accents, ponctuation, pluriels)', () => {
    expect(similarity('La démo du matin !', 'la demo du matin')).toBe(1);
    expect(isDuplicateAngle(angle('Ma routine du matin', 'Regarde ça'), angle('Routines du matin', 'Autre chose à dire'))).toBe(true);
    expect(isDuplicateAngle(angle('Le test au bureau', 'Tu doutes ? Moi aussi.'), angle('Déballage en direct', 'Tu doutes ? moi aussi !'))).toBe(true);
    expect(isDuplicateAngle(angle('Le test au bureau', 'Regarde ça'), angle('Déballage du colis', 'Il vient d’arriver'))).toBe(false);
    const { kept, rejected } = dedupeAngles([angle('A un', 'h un'), angle('A un !', 'h deux'), angle('Le meilleur produit', 'h trois'), angle('B deux', 'h quatre', { format: 'top3', pitch: 'Trois usages au bureau.' })]);
    expect(kept.map((k) => k.title)).toEqual(['A un', 'B deux']);
    expect(rejected).toBe(2); // un doublon, un interdit (« le meilleur »)
  });

  it('en simulé : 20 angles tous différents, formats et types variés', () => {
    const series = simulateSeries(product);
    expect(series).toHaveLength(SERIES_SIZE);
    expect(dedupeAngles(series).kept).toHaveLength(SERIES_SIZE);
    expect(new Set(series.map((s) => s.hook)).size).toBe(SERIES_SIZE);
    expect(new Set(series.map((s) => s.format)).size).toBe(8);
    expect(new Set(series.map((s) => s.angle)).size).toBe(4);
  });

  it('avec l’IA : écarte les doublons (entre eux et avec les séries précédentes), demande des remplaçants une fois', async () => {
    const WORDS = ['cuisine', 'bureau', 'voiture', 'salon', 'jardin', 'balcon', 'valise', 'piscine', 'garage', 'cave', 'grenier', 'matin', 'soir', 'week-end', 'pluie', 'été', 'hiver', 'rentrée', 'fête', 'vacances'];
    const ai: SeriesAngle[] = WORDS.map((w, i) => ({
      title: `Test ${w}`,
      hook: `On essaie ça côté ${w}`,
      format: SCRIPT_FORMATS[i % 8].id,
      angle: FIXED_ANGLES[(i + Math.floor(i / 8)) % 4],
      pitch: `Situation ${w} filmée de près.`,
    }));
    const calls: string[] = [];
    setStructuredRunnerForTests(async (request) => {
      calls.push(request.name);
      if (request.name === 'serie_angles') {
        // 15 angles corrects + 5 copies reformulées (majuscules, ponctuation).
        const copies = ai.slice(0, 5).map((a) => ({ ...a, title: `${a.title.toUpperCase()} !` }));
        return { angles: [...ai.slice(0, 15), ...copies] } as never;
      }
      expect(request.prompt).toMatch(/Déjà proposés/);
      return { angles: ai.slice(15) } as never;
    });
    const result = await generateSeries(product, { previous: [{ title: ai[0].title, hook: 'Une accroche déjà faite' }] });
    expect(calls).toEqual(['serie_angles', 'serie_angles_remplacement']);
    expect(result.simulated).toBe(false);
    expect(result.angles).toHaveLength(SERIES_SIZE);
    expect(result.duplicatesRemoved).toBe(6); // 5 copies + 1 angle déjà proposé dans une série précédente
    expect(result.filled).toBe(1);
    expect(dedupeAngles(result.angles).rejected).toBe(0);
  });

  it('réservée à Pro et Elite, quota de séries par jour appliqué côté serveur', async () => {
    for (const plan of ['aucun', 'starter'] as const) {
      const closed = await user(`serie-${plan}`, plan);
      expect(await seriesLeft(closed)).toBe(0);
      await expect(createSeries(closed, product.id)).rejects.toMatchObject({ code: 'plan' });
      expect(await repo.listRecords(closed.id, KIND_SERIES)).toHaveLength(0);
    }

    const pro = await user('serie-pro', 'pro');
    for (let i = 0; i < 3; i++) {
      const s = await createSeries(pro, product.id);
      expect(s.data.angles).toHaveLength(SERIES_SIZE);
    }
    expect(await seriesLeft(pro)).toBe(0);
    await expect(createSeries(pro, product.id)).rejects.toMatchObject({ code: 'quota' });
    expect(await listSeries(pro)).toHaveLength(3);
  });

  // Corrigé après le signalement de la mise à jour des tests (nouvelle grille).
  it('Elite : séries « illimitées », plafond de sécurité appliqué mais jamais chiffré', async () => {
    const elite = await user('serie-elite', 'elite');
    expect(isUnlimited('elite', 'anglesSeriesPerDay')).toBe(true);
    for (let i = 0; i < SAFETY_CAPS.anglesSeriesPerDay; i++) {
      await repo.saveRecord(elite.id, KIND_SERIES, { product_id: product.id, product_name: product.name, angles: [], simulated: true, duplicates_removed: 0, filled: 0 });
    }
    const refused = await createSeries(elite, product.id).catch((e: unknown) => e);
    expect(refused).toMatchObject({ code: 'quota' });
    expect((refused as Error).message).not.toContain(String(SAFETY_CAPS.anglesSeriesPerDay));
  });

  it('rend la place réservée si l’IA échoue', async () => {
    const pro = await user('serie-echec', 'pro');
    setStructuredRunnerForTests(async () => {
      throw new Error('panne');
    });
    await expect(createSeries(pro, product.id)).rejects.toMatchObject({ code: 'generation' });
    expect(await seriesLeft(pro)).toBe(3);
  });

  it('chaque angle devient un script en un clic (une écriture du jour), sans doublon au second clic', async () => {
    const pro = await user('serie-ecrire', 'pro');
    const series = await createSeries(pro, product.id);
    const target = series.data.angles[4];
    const doc = await writeFromAngle(pro, series.id, 4);
    expect(doc).toMatchObject({ format: target.format, series: { id: series.id, index: 4 }, settings: { angle: target.angle } });
    expect(doc.scripts[0].title).toBe(target.title);
    expect(doc.hooks[0].text).toBe(target.hook);
    expect((await getUsageToday(pro)).used).toBe(1);

    const again = await writeFromAngle(pro, series.id, 4);
    expect(again.id).toBe(doc.id);
    expect((await getUsageToday(pro)).used).toBe(1);
    expect([...(await writtenAngles(pro, series.id)).keys()]).toEqual([4]);
    expect((await repo.getRecord<{ angles: Array<{ doc_id: string | null }> }>(pro.id, series.id))?.data.angles[4].doc_id).toBe(doc.id);
  });
});
