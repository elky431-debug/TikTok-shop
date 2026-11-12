import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Product, ProductSnapshot, ScoreBreakdown } from '@/lib/db/types';
import { RUN, cleanupRun, createTestUser, supabaseReady, testEmail, type TestUser } from './helpers';

/**
 * Chaque méthode de SupabaseRepo, contre la vraie base. Les tests s'enchaînent (même état partagé),
 * dans l'ordre d'un vrai parcours : inscription, onboarding, radar, scripts, abonnement, parrainage…
 */

const breakdown = (total: number): ScoreBreakdown => ({
  total,
  parts: [],
  growth_7d: 0.2,
  daily_sales_7d: 40,
  summary: 'Produit de test.',
});

function product(n: number, score: number): Product {
  return {
    id: `${RUN}-p${n}`,
    provider: 'test',
    name: `Produit de test ${n}`,
    niche: 'animaux',
    description: 'Ligne créée par les tests d’intégration.',
    shop_name: 'Boutique de test',
    price_cents: 1990 + n,
    commission_rate: 0.15,
    active_affiliates: n === 1 ? null : 12 * n, // inconnu chez certaines sources
    image_url: '',
    top_videos: [],
    videos_fetched_at: null,
    details: null,
    snapshot_date: '2026-11-12',
    latest_score: score,
    latest_breakdown: breakdown(score),
    trend: 'monte',
    growth_7d: 0.2,
    sales_30d: [10, 12, 15],
    updated_at: new Date().toISOString(),
  };
}

describe.skipIf(!supabaseReady)('SupabaseRepo contre la vraie base', () => {
  let repo: import('@/lib/db').Repo;
  let student: TestUser;
  let other: TestUser;
  let coachUser: TestUser;
  const created: string[] = [];
  const day = '2026-11-12';
  const products = [product(1, 91), product(2, 80), product(3, 72), product(4, 65), product(5, 50)];

  beforeAll(async () => {
    const { getRepo } = await import('@/lib/db');
    repo = getRepo();
    expect(repo.kind).toBe('supabase');
    student = await createTestUser('eleve');
    other = await createTestUser('autre');
    coachUser = await createTestUser('formateur');
    created.push(student.id, other.id, coachUser.id);
  }, 60_000);

  afterAll(async () => {
    if (supabaseReady) await cleanupRun(created);
  }, 60_000);

  it('crée le profil à l’inscription (déclencheur) et ensureProfile le retrouve', async () => {
    const profile = await repo.getProfile(student.id);
    expect(profile).not.toBeNull();
    expect(profile!.email).toBe(student.email);
    expect(profile!.referral_code).toMatch(/^[A-Z2-9]{7}$/);
    expect(profile!.plan).toBe('free');
    expect(profile!.eligibility).toBe('preparation');
    const again = await repo.ensureProfile({ id: student.id, email: student.email });
    expect(again.referral_code).toBe(profile!.referral_code);
  });

  it('enregistre l’onboarding et recalcule l’éligibilité', async () => {
    const updated = await repo.updateProfile(student.id, {
      first_name: 'Inès',
      tiktok_handle: 'ines.test',
      follower_range: '1500-5000',
      niches: ['animaux'],
      video_style: 'face_camera',
      example_phrase: 'Les filles, faut que je vous montre un truc.',
      onboarded_at: new Date().toISOString(),
    });
    expect(updated.eligibility).toBe('affilie');
    expect(updated.niches).toEqual(['animaux']);
    await repo.updateProfile(other.id, { first_name: 'Autre', niches: ['animaux'], follower_range: '0-500', onboarded_at: new Date().toISOString() });
    const onboarded = await repo.listOnboardedProfiles();
    expect(onboarded.map((p) => p.id)).toEqual(expect.arrayContaining([student.id, other.id]));
    expect((await repo.listProfiles({ limit: 1000 })).some((p) => p.id === student.id)).toBe(true);
  });

  it('retrouve un profil par code de parrainage, client de paiement et compte Discord', async () => {
    const profile = (await repo.getProfile(student.id))!;
    expect((await repo.getProfileByReferralCode(profile.referral_code.toLowerCase()))?.id).toBe(student.id);
    await repo.updateProfile(student.id, { stripe_customer_id: `cus_${RUN}`, discord_user_id: `${RUN}-discord` });
    expect((await repo.getProfileByStripeCustomer(`cus_${RUN}`))?.id).toBe(student.id);
    expect((await repo.getProfileByDiscordId(`${RUN}-discord`))?.id).toBe(student.id);
    expect((await repo.listDiscordLinkedProfiles()).some((p) => p.id === student.id)).toBe(true);
  });

  it('écrit et relit le catalogue et l’historique', async () => {
    await repo.upsertProducts(products);
    const one = await repo.getProduct(products[0].id);
    expect(one?.commission_rate).toBe(0.15);
    expect(one?.active_affiliates).toBeNull();
    expect(one?.latest_breakdown?.total).toBe(91);
    expect((await repo.getProducts(products.map((p) => p.id))).length).toBe(products.length);
    expect((await repo.listProducts({ niches: ['animaux'] })).some((p) => p.id === products[0].id)).toBe(true);
    expect(await repo.countProducts()).toBeGreaterThanOrEqual(products.length);

    const snapshots: ProductSnapshot[] = ['2026-11-10', '2026-11-11', day].map((date, i) => ({
      product_id: products[0].id,
      date,
      affiliates: i === 0 ? null : 5 + i,
      estimated_sales: i === 0 ? null : 10 + i,
      units_sold_total: 1000 + i * 10,
      score: 80 + i,
      score_breakdown: breakdown(80 + i),
      trend: 'monte',
    }));
    await repo.upsertSnapshots(snapshots);
    await repo.upsertSnapshots(snapshots); // rejouable
    const history = await repo.getProductSnapshots(products[0].id, 3);
    expect(history.map((s) => s.date)).toEqual(['2026-11-10', '2026-11-11', day]);
    expect(history[0]).toMatchObject({ estimated_sales: null, affiliates: null, units_sold_total: 1000 });
  });

  it('met en cache les réponses du fournisseur, puis purge les entrées expirées', async () => {
    await repo.setProviderCache(`${RUN}-cle`, { products: [1, 2] }, new Date(Date.now() + 60_000).toISOString());
    expect(await repo.getProviderCache(`${RUN}-cle`)).toEqual({ products: [1, 2] });
    await repo.setProviderCache(`${RUN}-vieux`, { a: 1 }, new Date(Date.now() - 1000).toISOString());
    expect(await repo.getProviderCache(`${RUN}-vieux`)).toBeNull();
    expect(await repo.purgeProviderCache()).toBeGreaterThanOrEqual(1);
  });

  it('applique les limites de plan au radar, côté serveur', async () => {
    const { getRadar, canAccessProduct } = await import('@/lib/radar');
    const free = (await repo.updateProfile(other.id, { plan: 'free' }))!;
    const radar = await getRadar(free, {});
    expect(radar.visibleCount).toBeLessThanOrEqual(3);
    for (const item of radar.items) {
      if (item.kind === 'locked') expect(Object.keys(item).sort()).toEqual(['key', 'kind', 'niche', 'rank']);
    }
    const lockedVisible = radar.items.find((i) => i.kind === 'locked');
    if (lockedVisible) {
      const all = await repo.listProducts({ niches: ['animaux'] });
      const visibleIds = new Set(radar.items.flatMap((i) => (i.kind === 'visible' ? [i.product.id] : [])));
      const hidden = all.find((p) => !visibleIds.has(p.id));
      if (hidden) expect(await canAccessProduct(free, hidden.id)).toBe(false);
    }
    const pro = await repo.updateProfile(other.id, { plan: 'pro' });
    const proRadar = await getRadar(pro, {});
    expect(proRadar.lockedCount).toBe(0);
    expect(proRadar.items.every((i) => i.kind === 'visible' && i.product.score !== null)).toBe(true);
    await repo.updateProfile(other.id, { plan: 'free' });
  });

  it('sauvegarde, modifie, liste et supprime des scripts', async () => {
    const script = await repo.insertScript({
      user_id: student.id,
      product_id: products[0].id,
      format: 'demo',
      hooks: [{ text: 'Regarde ça.', seconds: 2 }],
      script: [],
      full_text: 'Texte',
      source: 'simulation',
      saved: false,
      regen_count: 0,
    });
    expect(script.id).toMatch(/[0-9a-f-]{36}/);
    expect((await repo.getScript(student.id, script.id))?.full_text).toBe('Texte');
    expect(await repo.getScript(other.id, script.id)).toBeNull();
    const kept = await repo.updateScript(student.id, script.id, { saved: true, regen_count: 1 });
    expect(kept.saved).toBe(true);
    expect((await repo.listScripts(student.id, { savedOnly: true })).map((s) => s.id)).toContain(script.id);
    expect(await repo.countScripts(student.id)).toBe(1);
    expect(await repo.countScripts()).toBeGreaterThanOrEqual(1);
    const second = await repo.insertScript({
      user_id: student.id,
      product_id: products[1].id,
      format: 'histoire',
      hooks: [],
      script: [],
      full_text: 'À supprimer',
      source: 'simulation',
      saved: false,
      regen_count: 0,
    });
    await repo.deleteScript(student.id, second.id);
    expect(await repo.getScript(student.id, second.id)).toBeNull();
  });

  it('compte l’usage de façon atomique, même en parallèle', async () => {
    expect(await repo.getUsage(student.id, day)).toBe(0);
    expect(await repo.incrementUsage(student.id, day, 2)).toBe(1);
    expect(await repo.incrementUsage(student.id, day, 2)).toBe(2);
    expect(await repo.incrementUsage(student.id, day, 2)).toBe(-1);
    await repo.decrementUsage(student.id, day);
    expect(await repo.getUsage(student.id, day)).toBe(1);

    const results = await Promise.all(Array.from({ length: 6 }, () => repo.incrementUsage(other.id, day, 3)));
    expect(results.filter((n) => n > 0).sort()).toEqual([1, 2, 3]);
    expect(results.filter((n) => n === -1)).toHaveLength(3);
    expect(await repo.incrementUsage(other.id, '2026-11-13', -1)).toBe(1);
  });

  it('gère « mes produits »', async () => {
    const saved = await repo.saveProduct(student.id, products[0].id);
    expect(saved.video_goal).toBe(20);
    expect((await repo.saveProduct(student.id, products[0].id)).id).toBe(saved.id);
    const updated = await repo.updateSavedProduct(student.id, products[0].id, { videos_posted: 3 });
    expect(updated.videos_posted).toBe(3);
    expect((await repo.getSavedProduct(student.id, products[0].id))?.videos_posted).toBe(3);
    expect(await repo.getSavedProduct(other.id, products[0].id)).toBeNull();
    await repo.saveProduct(student.id, products[1].id);
    await repo.removeSavedProduct(student.id, products[1].id);
    expect((await repo.listSavedProducts(student.id)).map((s) => s.product_id)).toEqual([products[0].id]);
  });

  it('enregistre les abonnements et rend les webhooks idempotents', async () => {
    const id = `sim_${RUN}`;
    await repo.upsertSubscription({
      id,
      user_id: student.id,
      provider: 'simulation',
      customer_id: null,
      status: 'active',
      plan: 'pro',
      billing_interval: 'month',
      price_id: null,
      current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      trial_end: null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    });
    expect((await repo.getSubscription(id))?.plan).toBe('pro');
    expect((await repo.getActiveSubscription(student.id))?.id).toBe(id);
    expect((await repo.listSubscriptions({ provider: 'simulation' })).some((s) => s.id === id)).toBe(true);
    await repo.upsertSubscription({ ...(await repo.getSubscription(id))!, status: 'canceled' });
    expect(await repo.getActiveSubscription(student.id)).toBeNull();

    expect(await repo.markBillingEvent(`${RUN}-evt`, 'invoice.paid')).toBe(true);
    expect(await repo.markBillingEvent(`${RUN}-evt`, 'invoice.paid')).toBe(false);
  });

  it('crée un formateur, rattache un élève et montre des données agrégées', async () => {
    const { applyReferralCode } = await import('@/lib/referral');
    const promo = `IT${RUN.slice(-6).toUpperCase()}`;
    const coach = await repo.createCoach({ user_id: coachUser.id, training_name: 'Formation de test', promo_code: promo, commission_rate: 0.3 });
    expect(coach.commission_rate).toBe(0.3);
    await expect(
      repo.createCoach({ user_id: coachUser.id, training_name: 'Doublon', promo_code: `${promo}X`, commission_rate: 0.3 }),
    ).rejects.toThrow(/déjà formateur/);
    expect((await repo.getCoachByUserId(coachUser.id))?.id).toBe(coach.id);
    expect((await repo.getCoachById(coach.id))?.promo_code).toBe(promo);
    expect((await repo.getCoachByPromoCode(promo.toLowerCase()))?.id).toBe(coach.id);
    expect((await repo.listCoaches()).some((c) => c.id === coach.id)).toBe(true);

    // Rattachement par le vrai code applicatif (avant la fin de l'onboarding).
    await repo.updateProfile(student.id, { onboarded_at: null });
    const result = await applyReferralCode((await repo.getProfile(student.id))!, promo.toLowerCase());
    expect(result.kind).toBe('coach');
    await repo.updateProfile(student.id, { onboarded_at: new Date().toISOString() });

    let students = await repo.listCoachStudents(coach.id);
    expect(students.map((s) => s.student_id)).toEqual([student.id]);
    expect(students[0]).toMatchObject({ first_name: 'Inès', scripts_generated: 1, products_followed: 1, email: null });
    await repo.updateProfile(student.id, { share_email_with_coach: true });
    students = await repo.listCoachStudents(coach.id);
    expect(students[0].email).toBe(student.email);
    await repo.updateProfile(student.id, { share_email_with_coach: false });
  });

  it('suit les parrainages et les commissions', async () => {
    expect(await repo.createReferral({ referrer_id: other.id, referred_id: other.id, coach_id: null })).toBeNull();
    const referral = await repo.getReferralByReferred(student.id);
    expect(referral?.referrer_id).toBe(coachUser.id);
    // Un filleul n'a qu'un parrain.
    expect(await repo.createReferral({ referrer_id: other.id, referred_id: student.id, coach_id: null })).toBeNull();
    await repo.updateReferral(referral!.id, { status: 'abonne' });

    const list = await repo.listReferralsByReferrer(coachUser.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ referred_first_name: 'Inès', status: 'abonne' });

    const commission = { referral_id: referral!.id, referrer_id: coachUser.id, invoice_id: `in_${RUN}`, amount_cents: 498, month: '2026-11' };
    expect(await repo.addCommission(commission)).toBe(true);
    expect(await repo.addCommission(commission)).toBe(false);
    expect((await repo.getReferralByReferred(student.id))?.commission_due_cents).toBe(498);
    expect((await repo.listCommissions(coachUser.id)).map((c) => c.invoice_id)).toEqual([`in_${RUN}`]);

    // Remboursement de la moitié, puis du tout ; rejoué : rien ne bouge deux fois.
    expect(await repo.refundCommission(`in_${RUN}`, 0.5)).toEqual({ canceledCents: 249, remainingCents: 249 });
    expect((await repo.getReferralByReferred(student.id))?.commission_due_cents).toBe(249);
    expect(await repo.refundCommission(`in_${RUN}`, 1)).toEqual({ canceledCents: 498, remainingCents: 0 });
    expect(await repo.refundCommission(`in_${RUN}`, 1)).toEqual({ canceledCents: 498, remainingCents: 0 });
    expect((await repo.getReferralByReferred(student.id))?.commission_due_cents).toBe(0);
    expect((await repo.listCommissions(coachUser.id))[0]).toMatchObject({ status: 'annulee', amount_cents: 0, canceled_cents: 498 });
    expect(await repo.refundCommission('in_inconnue', 1)).toBeNull();
  });

  it('prépare et met à jour le récap du matin', async () => {
    const content = { date: day, first_name: 'Inès', plan: 'pro' as const, products: [], hook: null, script: null, locked_count: 0 };
    await repo.upsertDigest({ user_id: student.id, day, content, email_status: 'pending', discord_status: 'pending' });
    await repo.upsertDigest({ user_id: student.id, day, content, email_status: 'pending', discord_status: 'pending' });
    expect((await repo.getDigest(student.id, day))?.content.first_name).toBe('Inès');
    await repo.updateDigestStatus(student.id, day, { email_status: 'sent' });
    const digests = await repo.listDigests(day);
    expect(digests.find((d) => d.user_id === student.id)?.email_status).toBe('sent');
  });

  it('lie un compte Discord par code à usage unique', async () => {
    const code = `${RUN.slice(-6).toUpperCase()}D`;
    await repo.createDiscordLinkCode(student.id, code, new Date(Date.now() + 600_000).toISOString());
    expect(await repo.consumeDiscordLinkCode(code.toLowerCase())).toBe(student.id);
    expect(await repo.consumeDiscordLinkCode(code)).toBeNull();
    const expired = `${RUN.slice(-6).toUpperCase()}E`;
    await repo.createDiscordLinkCode(other.id, expired, new Date(Date.now() - 1000).toISOString());
    expect(await repo.consumeDiscordLinkCode(expired)).toBeNull();
  });

  it('reçoit les demandes de partenariat', async () => {
    const application = await repo.insertCoachApplication({
      name: 'Formateur Test',
      email: testEmail('candidature'),
      training_name: 'Académie de test',
      audience_size: '1 000',
      message: 'Bonjour',
    });
    expect(application.status).toBe('nouvelle');
    await repo.updateCoachApplication(application.id, 'acceptee');
    expect((await repo.listCoachApplications()).find((a) => a.id === application.id)?.status).toBe('acceptee');
  });

  it('journalise les tâches planifiées', async () => {
    const run = await repo.startCronRun(RUN, 'manuel');
    expect(run.status).toBe('running');
    await repo.finishCronRun(run.id, 'ok', { produits: 5 });
    const runs = await repo.listCronRuns(20);
    expect(runs.find((r) => r.id === run.id)).toMatchObject({ status: 'ok', details: { produits: 5 } });
  });

  it('supprime un compte et toutes ses données en cascade', async () => {
    await repo.deleteUser(other.id);
    created.splice(created.indexOf(other.id), 1);
    expect(await repo.getProfile(other.id)).toBeNull();
    expect(await repo.getUsage(other.id, day)).toBe(0);
  });
});
