import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStructuredRunnerForTests } from '@/lib/ai/structured';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import {
  addFollowerEntry,
  checklistProgress,
  CHECKLIST,
  CONTENT_PLAN_KIND,
  ContentPlanSchema,
  contentPlansPerDay,
  declareThresholdReached,
  followerRangeFor,
  generateContentPlan,
  getPreparation,
  isSellingFree,
  keepSellingFree,
  nextFollowerRange,
  nicheStats,
  recommendNiches,
  recordFollowers,
  savePreparation,
  simulateContentPlan,
} from '@/lib/v2/preparation';
import { remainingToday } from '@/lib/v2/quota';
import { makeProduct, makeUser } from './v2-fixtures';

let repo: LocalRepo;
beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});
afterEach(() => {
  setRepoForTests(null);
  setStructuredRunnerForTests(null);
});

describe('bloc 11.1 · choisir sa niche (radar + goûts)', () => {
  const catalog = [
    makeProduct({ id: 'b1', niche: 'beaute', trend: 'explose', growth_7d: 0.5, commission_rate: 0.2 }),
    makeProduct({ id: 'b2', niche: 'beaute', trend: 'monte', growth_7d: 0.2, commission_rate: 0.15 }),
    makeProduct({ id: 'm1', niche: 'maison', trend: 'stable', growth_7d: 0, commission_rate: 0.1 }),
    makeProduct({ id: 'm2', niche: 'maison', trend: 'baisse', growth_7d: -0.3, commission_rate: 0.1 }),
  ];

  it('chiffres de chaque niche dans le radar du jour', () => {
    const stats = nicheStats(catalog);
    expect(stats.find((s) => s.niche === 'beaute')).toEqual({ niche: 'beaute', products: 2, rising: 2, avgGrowth: 0.35, medianCommission: 0.175 });
    expect(stats.find((s) => s.niche === 'tech')).toMatchObject({ products: 0, rising: 0, avgGrowth: null, medianCommission: null });
  });

  it('classe les niches qui montent, plus 20 points pour les niches aimées, avec des phrases', () => {
    const advice = recommendNiches(nicheStats(catalog), []);
    expect(advice[0].niche).toBe('beaute');
    expect(advice[0].reasons[0]).toBe('2 produits sur 2 montent ou explosent dans le radar du jour.');
    expect(advice.at(-1)!.products).toBe(0);
    const liked = recommendNiches(nicheStats(catalog), ['maison']);
    const maison = liked.find((a) => a.niche === 'maison')!;
    const without = advice.find((a) => a.niche === 'maison')!;
    expect(maison.score - without.score).toBe(20);
    expect(maison.reasons.at(-1)).toMatch(/Tu as dit aimer cette niche/);
    // Une niche aimée sans produit du jour garde ses 20 points.
    expect(recommendNiches(nicheStats(catalog), ['tech']).find((a) => a.niche === 'tech')!.score).toBe(20);
  });
});

describe('bloc 11.2 · plan de contenu de 30 jours, sans vente', () => {
  it('plan simulé : 30 jours, présentation au jour 1, un bilan par semaine, aucune vente', () => {
    const plan = simulateContentPlan('beaute');
    expect(ContentPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.days.map((d) => d.day)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(plan.days[0].type).toBe('presentation');
    expect(plan.days.filter((d) => d.type === 'bilan').map((d) => d.day)).toEqual([7, 14, 21, 28]);
    for (const d of plan.days) expect(isSellingFree(`${d.title} ${d.idea} ${d.hook}`)).toBe(true);
    expect(new Set(plan.days.map((d) => d.title)).size).toBeGreaterThan(20);
  });

  it('sans clé : plan simulé ; avec un fournisseur, les jours qui parlent de vente sont remplacés', async () => {
    const simulated = await generateContentPlan('maison', { video_style: 'voix_off', example_phrase: null }, null);
    expect(simulated).toMatchObject({ simulated: true, replaced: 0 });
    const selling = simulateContentPlan('maison');
    selling.days[3] = { ...selling.days[3], idea: 'Mets le lien dans le panier orange et utilise mon code promo.' };
    selling.days[9] = { ...selling.days[9], hook: 'Gagne 500 € par mois avec moi.' };
    setStructuredRunnerForTests(async () => selling as never);
    const result = await generateContentPlan('maison', { video_style: 'voix_off', example_phrase: null }, 'Ma cuisine');
    expect(result).toMatchObject({ simulated: false, replaced: 2 });
    expect(result.plan.days[3].idea).not.toMatch(/lien|promo/);
    expect(keepSellingFree(simulateContentPlan('sport'), 'sport').replaced).toBe(0);
  });

  it('quota côté serveur : 3 plans par jour pour tout abonné (dès Starter), aucun sans abonnement', async () => {
    expect(contentPlansPerDay({ plan: 'aucun' })).toBe(0);
    expect(contentPlansPerDay({ plan: 'starter' })).toBe(3);
    expect(contentPlansPerDay({ plan: 'pro' })).toBe(3);
    expect(contentPlansPerDay({ plan: 'elite' })).toBe(3);
    const save = (id: string) =>
      repo.saveRecord(id, CONTENT_PLAN_KIND, { niche: 'beaute', plan: simulateContentPlan('beaute'), simulated: true, created_at: '' });

    const starter = await makeUser(repo, 'u', 'starter');
    expect(await remainingToday('u', CONTENT_PLAN_KIND, contentPlansPerDay(starter))).toBe(3);
    for (let i = 0; i < 3; i++) await save('u');
    expect(await remainingToday('u', CONTENT_PLAN_KIND, contentPlansPerDay(starter))).toBe(0);

    const none = await makeUser(repo, 'sans-abo', 'aucun');
    expect(await remainingToday('sans-abo', CONTENT_PLAN_KIND, contentPlansPerDay(none))).toBe(0);
  });
});

describe('bloc 11.3 · liste de vérification et courbe des abonnés', () => {
  it('liste de vérification : conditions et conseils, progression', async () => {
    expect(CHECKLIST.some((i) => i.kind === 'condition')).toBe(true);
    expect(CHECKLIST.some((i) => i.kind === 'conseil')).toBe(true);
    expect(checklistProgress({ age: true, compte: true, inconnu: true })).toEqual({ done: 2, total: CHECKLIST.length });
    await makeUser(repo, 'u', 'starter');
    await savePreparation(repo, 'u', { checklist: { age: true } });
    await savePreparation(repo, 'u', { niche: 'beaute' });
    expect((await getPreparation(repo, 'u')).data).toMatchObject({ checklist: { age: true }, niche: 'beaute' });
    expect(await repo.listRecords('u', 'preparation')).toHaveLength(1);
  });

  it('saisies d’abonnés triées par date, une par jour', () => {
    let entries = addFollowerEntry([], { date: '2026-11-10', count: 300 });
    entries = addFollowerEntry(entries, { date: '2026-11-03', count: 210 });
    entries = addFollowerEntry(entries, { date: '2026-11-10', count: 320 });
    expect(entries).toEqual([{ date: '2026-11-03', count: 210 }, { date: '2026-11-10', count: 320 }]);
    expect(followerRangeFor(999)).toBe('0-1000');
    expect(followerRangeFor(1499)).toBe('1000-5000');
    expect(followerRangeFor(1500)).toBe('1500-5000');
    expect(followerRangeFor(25000)).toBe('20000-100000');
    expect(followerRangeFor(150000)).toBe('100000+');
  });
});

describe('bloc 11.4 · passage automatique au mode affilié', () => {
  it('au seuil, la tranche d’abonnés et l’éligibilité changent ; une baisse ne retire pas le mode affilié', async () => {
    await makeUser(repo, 'u', 'starter', { follower_range: '0-500' });
    let profile = (await repo.getProfile('u'))!;
    expect(profile.eligibility).toBe('preparation');

    const first = await recordFollowers(repo, profile, { date: '2026-11-05', count: 820 }, '2026-11-12');
    expect(first).toMatchObject({ eligibility: 'preparation', switched: false, range: '0-1000' });
    profile = (await repo.getProfile('u'))!;

    const second = await recordFollowers(repo, profile, { date: '2026-11-12', count: 1530 }, '2026-11-12');
    expect(second).toMatchObject({ eligibility: 'affilie', switched: true, range: '1500-5000' });
    profile = (await repo.getProfile('u'))!;
    expect(profile).toMatchObject({ eligibility: 'affilie', follower_range: '1500-5000' });
    expect((await getPreparation(repo, 'u')).data.switched_at).toBe('2026-11-12');

    const drop = await recordFollowers(repo, profile, { date: '2026-11-13', count: 1490 }, '2026-11-13');
    expect(drop).toMatchObject({ eligibility: 'affilie', switched: false });
    expect((await repo.getProfile('u'))!.follower_range).toBe('1500-5000');
    expect(nextFollowerRange('500-1500', 300)).toBeNull();
    expect(nextFollowerRange('1500-5000', 6000)).toBe('5000-20000');
  });

  it('« j’ai atteint le seuil » sans chiffre : passage au mode affilié, aucun point inventé sur la courbe', async () => {
    await makeUser(repo, 'u', 'starter', { follower_range: '500-1500' });
    const profile = (await repo.getProfile('u'))!;
    expect(await declareThresholdReached(repo, profile, '2026-11-12')).toMatchObject({ eligibility: 'affilie', switched: true, range: '1500-5000' });
    expect((await getPreparation(repo, 'u')).data.followers).toEqual([]);
    expect(await declareThresholdReached(repo, (await repo.getProfile('u'))!, '2026-11-13')).toMatchObject({ switched: false });
  });
});

describe('onboarding 2 · éligibilité', () => {
  it('« pas encore » ⇒ préparation ; 1 000–5 000 ⇒ affilié seulement si la personne l’est déjà', async () => {
    const { eligibilityFor } = await import('@/lib/profile-rules');
    expect(eligibilityFor('0-1000', 'oui')).toBe('preparation');
    expect(eligibilityFor('1000-5000', 'oui')).toBe('affilie');
    expect(eligibilityFor('1000-5000', 'ne_sait_pas')).toBe('preparation');
    expect(eligibilityFor('20000-100000', 'pas_encore')).toBe('preparation');
    expect(eligibilityFor('20000-100000', null)).toBe('affilie');
    expect(eligibilityFor('1500-5000', null)).toBe('affilie');
  });
});
