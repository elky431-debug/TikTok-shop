import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { annualOffer } from '@/lib/billing/annual-offer';
import { checkoutSessionParams } from '@/lib/billing/stripe';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { Profile, Subscription } from '@/lib/db/types';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { dueLifecycleEmails, pickTonight, type LifecycleContext } from '@/lib/lifecycle/engine';
import { runLifecycleNightly } from '@/lib/lifecycle/nightly';
import { setDisabledLifecycle } from '@/lib/lifecycle/preferences';
import { getLifecycleLog } from '@/lib/lifecycle/send';
import { onOnboardingCompleted, welcomeProducts, WELCOME_STEPS } from '@/lib/onboarding';
import { createScripts } from '@/lib/studio';

let repo: LocalRepo;
beforeEach(async () => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});
afterEach(() => {
  setRepoForTests(null);
  vi.useRealTimers();
});

const ctx = (patch: Partial<LifecycleContext> & { onboarded?: string; seen?: string | null }): LifecycleContext => ({
  profile: { onboarded_at: patch.onboarded ?? '2026-11-10T09:00:00Z', last_seen_at: patch.seen ?? null, coach_id: null },
  scripts: 0,
  subscription: null,
  pastDueSince: null,
  now: new Date('2026-11-13T03:00:00Z'),
  ...patch,
});

describe('e-mails de cycle de vie : quand', () => {
  it('bienvenue le jour même, astuce le lendemain, rappel au 3e jour seulement sans script', () => {
    expect(dueLifecycleEmails(ctx({ onboarded: '2026-11-13T02:00:00Z' })).map((d) => d.type)).toEqual(['bienvenue']);
    expect(dueLifecycleEmails(ctx({ onboarded: '2026-11-12T09:00:00Z' })).map((d) => d.type)).toEqual(['bienvenue', 'astuce_j1']);
    expect(dueLifecycleEmails(ctx({ onboarded: '2026-11-10T09:00:00Z' })).map((d) => d.type)).toEqual(['rappel_j3', 'astuce_j1']);
    expect(dueLifecycleEmails(ctx({ onboarded: '2026-11-10T09:00:00Z', scripts: 2 })).map((d) => d.type)).toEqual(['astuce_j1']);
    // Compte ancien au déploiement : pas de bienvenue tardif.
    expect(dueLifecycleEmails(ctx({ onboarded: '2026-09-01T09:00:00Z', seen: '2026-11-12T09:00:00Z' }))).toEqual([]);
  });

  it('réactivation après 14 jours d’absence (une fois par absence), fin d’essai formateur, relance de paiement', () => {
    const away = dueLifecycleEmails(ctx({ onboarded: '2026-09-01T09:00:00Z', seen: '2026-10-25T09:00:00Z' }));
    expect(away).toEqual([{ type: 'reactivation', key: 'reactivation:2026-10-25' }]);
    const trial = { id: 'sub_1', status: 'trialing', trial_end: '2026-11-15T10:00:00Z' } as Subscription;
    const withCoach = { onboarded_at: '2026-08-20T09:00:00Z', last_seen_at: '2026-11-12T09:00:00Z', coach_id: 'c1' };
    expect(dueLifecycleEmails({ ...ctx({}), profile: withCoach, subscription: trial }).map((d) => d.key)).toEqual(['fin_essai:sub_1']);
    expect(dueLifecycleEmails({ ...ctx({}), profile: { ...withCoach, coach_id: null }, subscription: trial })).toEqual([]);
    const pastDue = { id: 'sub_2', status: 'past_due', trial_end: null } as Subscription;
    const seen = { ...withCoach, coach_id: null };
    expect(dueLifecycleEmails({ ...ctx({}), profile: seen, subscription: pastDue, pastDueSince: '2026-11-11' })).toEqual([]);
    expect(dueLifecycleEmails({ ...ctx({}), profile: seen, subscription: pastDue, pastDueSince: '2026-11-10' })).toEqual([
      { type: 'relance_paiement', key: 'relance_paiement:sub_2:2026-11-10' },
    ]);
  });

  it('au plus un conseil par nuit, les e-mails d’abonnement en plus', () => {
    expect(
      pickTonight([
        { type: 'bienvenue', key: 'bienvenue' },
        { type: 'astuce_j1', key: 'astuce_j1' },
        { type: 'fin_essai', key: 'fin_essai:s' },
      ]).map((d) => d.type),
    ).toEqual(['bienvenue', 'fin_essai']);
  });
});

describe('e-mails de cycle de vie : envoi', () => {
  async function member(id: string, patch: Partial<Profile>) {
    await repo.ensureProfile({ id, email: `${id}@test.fr` });
    return repo.updateProfile(id, { niches: ['beaute'], first_name: 'Léa', ...patch });
  }

  it('une seule fois chacun, programmés à 11 h, coupés par type, avec désinscription en un clic', async () => {
    await refreshCatalog({ repo, provider: new MockProvider(), date: '2026-11-13' });
    await member('lea', { onboarded_at: '2026-11-12T09:00:00Z' });
    await member('sans', { onboarded_at: '2026-11-12T09:00:00Z' });
    await setDisabledLifecycle('sans', ['bienvenue', 'astuce_j1'], repo);
    const now = new Date('2026-11-13T03:00:00Z');

    expect(await runLifecycleNightly('2026-11-13', repo, now)).toEqual({ sent: { bienvenue: 1 }, failed: 0 });
    expect(await runLifecycleNightly('2026-11-13', repo, now)).toEqual({ sent: {}, failed: 0 });
    // Le lendemain : l'astuce (le bienvenue est déjà parti).
    expect(await runLifecycleNightly('2026-11-14', repo, new Date('2026-11-14T03:00:00Z'))).toEqual({ sent: { astuce_j1: 1 }, failed: 0 });
    const mails = (await repo.listLocalEmails!(10)).filter((m) => m.to === 'lea@test.fr');
    expect(mails.map((m) => m.subject).sort()).toEqual(['Astuce : 20 vidéos sur le même produit', 'Bienvenue sur Tracktout, Léa']);
    expect(mails.every((m) => m.scheduled_at?.endsWith(':00:00.000Z'))).toBe(true);
    expect(mails[0].html).toContain('Ne plus recevoir ces e-mails');
    expect(mails.some((m) => /gagne|€ par mois/i.test(m.subject))).toBe(false);
    expect((await repo.listLocalEmails!(10)).some((m) => m.to === 'sans@test.fr')).toBe(false);
    expect(Object.keys((await getLifecycleLog('lea', repo)).log.sent).sort()).toEqual(['astuce_j1', 'bienvenue']);
  });

  it('relance de paiement : seulement après 3 nuits en retard de paiement, une fois par incident', async () => {
    await member('pay', { onboarded_at: '2026-09-01T09:00:00Z', last_seen_at: '2026-11-12T09:00:00Z', plan: 'pro' });
    await repo.upsertSubscription({
      id: 'sub_p', user_id: 'pay', provider: 'stripe', customer_id: 'cus', status: 'past_due', plan: 'pro', billing_interval: 'month',
      price_id: 'price', current_period_end: '2026-12-01T00:00:00Z', trial_end: null, cancel_at_period_end: false, updated_at: '2026-11-10T00:00:00Z',
    });
    const night = (day: string) => runLifecycleNightly(day, repo, new Date(`${day}T03:00:00Z`));
    expect((await night('2026-11-10')).sent).toEqual({});
    expect((await night('2026-11-12')).sent).toEqual({});
    expect((await night('2026-11-13')).sent).toEqual({ relance_paiement: 1 });
    expect((await night('2026-11-14')).sent).toEqual({});
  });
});

describe('moment « waouh » de l’inscription', () => {
  it('en 6 étapes : 3 produits du jour, un premier script simulé sans clé, e-mail de bienvenue immédiat', async () => {
    await refreshCatalog({ repo, provider: new MockProvider(), date: new Date().toISOString().slice(0, 10) });
    await repo.ensureProfile({ id: 'neo', email: 'neo@test.fr' });
    const profile = await repo.updateProfile('neo', { niches: ['beaute'], first_name: 'Néo', video_style: 'face_camera', onboarded_at: new Date().toISOString() });
    expect(WELCOME_STEPS).toHaveLength(6);
    const started = Date.now();
    const { products } = await welcomeProducts(profile);
    expect(products).toHaveLength(3);
    const script = await createScripts(profile, products[0].id, 'demo');
    expect(script.source).toBe('simulation');
    expect(script.hooks.length).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(await onOnboardingCompleted('neo')).toEqual({ trialStarted: false, welcomeSent: true });
    expect(await onOnboardingCompleted('neo')).toMatchObject({ welcomeSent: false });
    expect((await repo.listLocalEmails!(5)).filter((m) => m.to === 'neo@test.fr').map((m) => m.subject)).toEqual(['Bienvenue sur Tracktout, Néo']);
  });
});

describe('passage à Pro : annuel, codes de réduction', () => {
  it('l’économie annuelle vient des prix des plans, jamais écrite à la main', () => {
    expect(annualOffer('pro')).toMatchObject({ savingsCents: 1990 * 12 - 16700, percent: 30, monthsFree: 3, badge: 'Plus de 3 mois offerts' });
    expect(annualOffer('proplus').savingsCents).toBe(3990 * 12 - 33500);
  });

  it('Checkout accepte les codes promotionnels Stripe, en français', () => {
    const params = checkoutSessionParams({ customer: 'cus_1', userId: 'u1', price: 'price_y', siteUrl: 'https://x.fr' });
    expect(params).toMatchObject({ mode: 'subscription', allow_promotion_codes: true, locale: 'fr', client_reference_id: 'u1' });
    expect(params.cancel_url).toBe('https://x.fr/app/passer-pro?paiement=annule');
  });
});
