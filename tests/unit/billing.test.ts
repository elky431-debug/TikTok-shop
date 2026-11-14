import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentGiven, latestConsent, recordConsent, WITHDRAWAL_CONSENT_TEXT } from '@/lib/billing/consent';
import { handleBillingEvent } from '@/lib/billing/events';
import { grantPlan } from '@/lib/billing/grant';
import { planFromPrice, priceLookupKey } from '@/lib/billing/prices';
import { expireSimulatedTrials, simulateSubscription } from '@/lib/billing/simulated';
import { normalizeStripeEvent, parseStripeWebhook } from '@/lib/billing/stripe';
import type { SubscriptionChanged } from '@/lib/billing/types';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { getPlan } from '@/lib/plans';
import { applyReferralCode } from '@/lib/referral';

let repo: LocalRepo;

beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});

afterEach(() => {
  setRepoForTests(null);
  process.env.STRIPE_SECRET_KEY = '';
  process.env.STRIPE_WEBHOOK_SECRET = '';
});

async function makeUser(id: string) {
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  return repo.updateProfile(id, { first_name: id, onboarded_at: null });
}

async function makeCoach() {
  const user = await makeUser('coach');
  return repo.createCoach({ user_id: user.id, training_name: 'Formation Test', promo_code: 'TEST30', commission_rate: 0.3 });
}

function subEvent(overrides: Partial<SubscriptionChanged> = {}): SubscriptionChanged {
  return {
    kind: 'subscription',
    eventId: `evt_${Math.random()}`,
    provider: 'stripe',
    subscriptionId: 'sub_1',
    customerId: 'cus_1',
    userId: 'eleve',
    status: 'active',
    plan: 'pro',
    interval: 'month',
    priceId: 'price_pro_m',
    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    trialEnd: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

const mailsTo = async (to: string) => (await repo.listLocalEmails!(50)).filter((m) => m.to === to);

describe('prix : clé de recherche Stripe et plan d’un prix', () => {
  it('retrouve chaque prix par la clé créée dans Stripe : <plan>_mensuel ou <plan>_annuel', () => {
    expect(priceLookupKey('starter', 'month')).toBe('starter_mensuel');
    expect(priceLookupKey('starter', 'year')).toBe('starter_annuel');
    expect(priceLookupKey('pro', 'month')).toBe('pro_mensuel');
    expect(priceLookupKey('pro', 'year')).toBe('pro_annuel');
    expect(priceLookupKey('elite', 'month')).toBe('elite_mensuel');
    expect(priceLookupKey('elite', 'year')).toBe('elite_annuel');
  });

  it('retrouve plan et période : prix simulé, clé de recherche, sinon métadonnées ; « proplus » devient Elite', () => {
    expect(planFromPrice('sim_starter_month')).toEqual({ plan: 'starter', interval: 'month' });
    expect(planFromPrice('sim_proplus_year')).toEqual({ plan: 'elite', interval: 'year' });
    expect(planFromPrice({ id: 'price_x', lookup_key: 'pro_annuel' })).toEqual({ plan: 'pro', interval: 'year' });
    expect(planFromPrice({ id: 'price_x', lookup_key: 'elite_mensuel' })).toEqual({ plan: 'elite', interval: 'month' });
    expect(planFromPrice({ id: 'price_x', lookup_key: 'tracktout_pro_year' })).toEqual({ plan: 'pro', interval: 'year' }); // ancienne clé
    expect(planFromPrice({ id: 'price_x', lookup_key: 'tracktout_proplus_month' })).toEqual({ plan: 'elite', interval: 'month' });
    // Ancien prix (sans clé, transférée au nouveau) : reconnu par ses métadonnées et sa périodicité.
    expect(planFromPrice({ id: 'price_old', lookup_key: null, metadata: { plan: 'proplus' }, recurring: { interval: 'year' } })).toEqual({
      plan: 'elite',
      interval: 'year',
    });
    expect(planFromPrice({ id: 'price_old', metadata: { plan: 'starter' }, recurring: { interval: 'month' } })).toEqual({
      plan: 'starter',
      interval: 'month',
    });
  });

  it('ne devine jamais un plan inconnu ni le plan « sans abonnement »', () => {
    expect(planFromPrice(null)).toBeNull();
    expect(planFromPrice('price_inconnu')).toBeNull();
    expect(planFromPrice('sim_free_month')).toBeNull();
    expect(planFromPrice('sim_aucun_month')).toBeNull();
    expect(planFromPrice({ id: 'p', lookup_key: 'autre_pro_month' })).toBeNull();
    expect(planFromPrice({ id: 'p', metadata: { plan: 'pro' }, recurring: { interval: 'week' } })).toBeNull();
    expect(planFromPrice({ id: 'p', metadata: { plan: 'free' }, recurring: { interval: 'month' } })).toBeNull();
  });
});

describe('normalisation des événements Stripe', () => {
  it('lit un abonnement au format actuel de l’API (période sur la ligne, plan par la clé du prix)', () => {
    const event = normalizeStripeEvent({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_9',
          customer: 'cus_9',
          status: 'active',
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { user_id: 'u9' },
          items: {
            data: [
              {
                current_period_end: 1_900_000_000,
                price: { id: 'price_elite_y', lookup_key: 'tracktout_elite_year', recurring: { interval: 'year' } },
              },
            ],
          },
        },
      },
    });
    expect(event).toMatchObject({
      kind: 'subscription',
      subscriptionId: 'sub_9',
      customerId: 'cus_9',
      userId: 'u9',
      status: 'active',
      plan: 'elite',
      interval: 'year',
      priceId: 'price_elite_y',
      currentPeriodEnd: new Date(1_900_000_000_000).toISOString(),
    });
  });

  it('reconnaît un abonné de l’ancienne grille (prix Pro+ sans clé, plan en métadonnées) comme Elite', () => {
    const event = normalizeStripeEvent({
      id: 'evt_old',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_old',
          customer: 'cus_old',
          status: 'active',
          metadata: { user_id: 'u_old' },
          items: { data: [{ current_period_end: 1_900_000_000, price: { id: 'price_plus_m', metadata: { plan: 'proplus' }, recurring: { interval: 'month' } } }] },
        },
      },
    });
    expect(event).toMatchObject({ kind: 'subscription', plan: 'elite', interval: 'month' });
  });

  it('lit une facture payée (abonnement dans parent, taxes déduites)', () => {
    const event = normalizeStripeEvent({
      id: 'evt_2',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_1',
          customer: 'cus_1',
          amount_paid: 5999,
          total_taxes: [{ amount: 1000 }],
          status_transitions: { paid_at: 1_800_000_000 },
          parent: { subscription_details: { subscription: 'sub_1', metadata: { user_id: 'u1' } } },
        },
      },
    });
    expect(event).toMatchObject({ kind: 'invoice_paid', invoiceId: 'in_1', subscriptionId: 'sub_1', userId: 'u1', amountCents: 4999 });
  });

  it('ignore les événements non gérés', () => {
    expect(normalizeStripeEvent({ id: 'e', type: 'payment_intent.created', data: { object: {} } })).toMatchObject({ kind: 'ignored' });
  });
});

describe('signature des webhooks', () => {
  it('accepte une signature valide et refuse une signature falsifiée', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_factice';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    const payload = JSON.stringify({
      id: 'evt_sig',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', customer: 'cus_1', client_reference_id: 'u1', subscription: 'sub_1' } },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
    expect(parseStripeWebhook(payload, header)).toMatchObject({ kind: 'checkout_completed', userId: 'u1', customerId: 'cus_1' });
    const forged = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_autre' });
    expect(() => parseStripeWebhook(payload, forged)).toThrow();
    expect(() => parseStripeWebhook(payload, null)).toThrow();
  });

  it('refuse tout webhook si le secret n’est pas configuré', () => {
    expect(() => parseStripeWebhook('{}', 't=1,v1=abc')).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});

describe('traitement des événements', () => {
  it('un compte neuf n’a aucun abonnement, donc aucun accès', async () => {
    const user = await makeUser('neuf');
    expect(user.plan).toBe('aucun');
    expect(getPlan(user.plan).access).toBe(false);
  });

  it('active le plan, compte 30 % de commission au formateur, une seule fois par facture', async () => {
    await makeCoach();
    const eleve = await makeUser('eleve');
    expect((await applyReferralCode(eleve, 'TEST30')).kind).toBe('coach');

    const result = await handleBillingEvent(subEvent());
    expect(result).toMatchObject({ status: 'ok', plan: 'pro' });
    expect((await repo.getProfile('eleve'))?.plan).toBe('pro');
    expect((await repo.getProfile('eleve'))?.stripe_customer_id).toBe('cus_1');

    const invoice = {
      kind: 'invoice_paid' as const,
      eventId: 'evt_inv_1',
      provider: 'stripe' as const,
      invoiceId: 'in_1',
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      userId: null,
      amountCents: 4999,
      paidAt: '2026-11-12T08:00:00.000Z',
    };
    expect(await handleBillingEvent(invoice)).toMatchObject({ status: 'ok', commissionCents: 1500 });
    // Même événement rejoué, puis même facture via un autre événement : pas de double commission.
    expect(await handleBillingEvent(invoice)).toMatchObject({ status: 'duplicate' });
    await handleBillingEvent({ ...invoice, eventId: 'evt_inv_1_bis' });
    const commissions = await repo.listCommissions('coach');
    expect(commissions).toHaveLength(1);
    expect(commissions[0]).toMatchObject({ amount_cents: 1500, month: '2026-11' });
    const [referral] = await repo.listReferralsByReferrer('coach');
    expect(referral).toMatchObject({ status: 'abonne', commission_due_cents: 1500 });
  });

  it('repasse sans abonnement (sans accès) à la résiliation', async () => {
    await makeUser('eleve');
    await handleBillingEvent(subEvent());
    await handleBillingEvent(subEvent({ status: 'canceled' }));
    const profile = await repo.getProfile('eleve');
    expect(profile?.plan).toBe('aucun');
    expect(getPlan(profile?.plan).access).toBe(false);
  });

  it('garde le meilleur plan si plusieurs abonnements (Elite > Pro > Starter)', async () => {
    await makeUser('eleve');
    await handleBillingEvent(subEvent({ subscriptionId: 'sub_a', plan: 'starter', priceId: 'price_s_m' }));
    expect((await repo.getProfile('eleve'))?.plan).toBe('starter');
    await handleBillingEvent(subEvent({ subscriptionId: 'sub_b', plan: 'elite', priceId: 'price_e_m' }));
    await handleBillingEvent(subEvent({ subscriptionId: 'sub_c', plan: 'pro' }));
    expect((await repo.getProfile('eleve'))?.plan).toBe('elite');
    await handleBillingEvent(subEvent({ subscriptionId: 'sub_b', plan: 'elite', status: 'canceled' }));
    expect((await repo.getProfile('eleve'))?.plan).toBe('pro');
  });

  it('retrouve l’utilisateur par son identifiant client', async () => {
    await makeUser('eleve');
    await repo.updateProfile('eleve', { stripe_customer_id: 'cus_42' });
    const result = await handleBillingEvent(subEvent({ userId: null, customerId: 'cus_42' }));
    expect(result).toMatchObject({ status: 'ok', userId: 'eleve' });
  });

  it('signale un utilisateur inconnu sans planter', async () => {
    expect(await handleBillingEvent(subEvent({ userId: 'personne', customerId: 'cus_x' }))).toMatchObject({ status: 'unknown_user' });
  });

  it('confirme un nouvel abonnement par e-mail, une seule fois par abonnement, avec le texte de démarrage immédiat', async () => {
    const eleve = await makeUser('eleve');
    await recordConsent(repo, eleve, { plan: 'pro', interval: 'month' }, new Date('2026-11-13T10:00:00Z'));
    await handleBillingEvent(subEvent());
    // Mise à jour du même abonnement (renouvellement, changement de carte) : pas de deuxième confirmation.
    await handleBillingEvent(subEvent({ currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000).toISOString() }));
    const mails = await mailsTo('eleve@test.fr');
    expect(mails.map((m) => m.subject)).toEqual(['Ton abonnement Pro a démarré']);
    expect(mails[0].html).toContain('59,99');
    expect(mails[0].html).toContain('démarre tout de suite');
    expect(mails[0].html).toContain('14 jours');
    expect(mails[0].html).not.toContain('premier mois');
  });

  it('pas d’e-mail de confirmation pour une résiliation ni un abonnement en impayé', async () => {
    await makeUser('eleve');
    await handleBillingEvent(subEvent({ subscriptionId: 'sub_x', status: 'past_due' }));
    await handleBillingEvent(subEvent({ subscriptionId: 'sub_y', status: 'canceled' }));
    expect(await mailsTo('eleve@test.fr')).toHaveLength(0);
  });
});

describe('demande de démarrage immédiat (rétractation)', () => {
  it('la case doit valoir « oui » ; la demande est enregistrée avec son texte exact, la dernière fait foi', async () => {
    const yes = new FormData();
    yes.set('demarrage_immediat', 'oui');
    expect(consentGiven(yes)).toBe(true);
    const other = new FormData();
    other.set('demarrage_immediat', 'on');
    expect(consentGiven(other)).toBe(false);
    expect(consentGiven(new FormData())).toBe(false);

    const user = await makeUser('client');
    expect(await latestConsent(repo, user.id)).toBeNull();
    await recordConsent(repo, user, { plan: 'starter', interval: 'year' }, new Date('2026-11-12T09:00:00Z'));
    await recordConsent(repo, user, { plan: 'pro', interval: 'month' }, new Date('2026-11-13T09:00:00Z'));
    expect(await latestConsent(repo, user.id)).toMatchObject({
      text: WITHDRAWAL_CONSENT_TEXT,
      plan: 'pro',
      interval: 'month',
      accepted_at: '2026-11-13T09:00:00.000Z',
    });
  });
});

describe('code formateur : remise saisie au paiement (code promo Stripe)', () => {
  it('un élève rattaché paie le prix affiché ici (la remise vient de son code promo chez Stripe) ; 30 % de ce qui est payé', async () => {
    await makeCoach();
    await makeUser('eleve');
    await applyReferralCode((await repo.getProfile('eleve'))!, 'TEST30');
    const eleve = (await repo.getProfile('eleve'))!;
    await recordConsent(repo, eleve, { plan: 'pro', interval: 'month' });
    await simulateSubscription(eleve, 'pro', 'month', repo);
    expect((await repo.getProfile('eleve'))?.plan).toBe('pro');
    const [commission] = await repo.listCommissions('coach');
    expect(commission.amount_cents).toBe(Math.round(5999 * 0.3));
    // L'e-mail ne promet aucun montant remisé : le reçu de Stripe montre la remise réellement appliquée.
    const [mail] = await mailsTo('eleve@test.fr');
    expect(mail.subject).toBe('Ton abonnement Pro a démarré');
    expect(mail.html).not.toContain('premier mois est à');
  });
});

describe('paiement simulé et abonnements hors paiement', () => {
  it('le paiement simulé passe par le même traitement (plan + commission parrain)', async () => {
    const parrain = await makeUser('parrain');
    const filleul = await makeUser('filleul');
    await applyReferralCode(filleul, parrain.referral_code);
    await simulateSubscription((await repo.getProfile('filleul'))!, 'elite', 'year', repo);
    expect((await repo.getProfile('filleul'))?.plan).toBe('elite');
    const [commission] = await repo.listCommissions('parrain');
    expect(commission.amount_cents).toBe(Math.round(77990 * 0.3));
  });

  it('un essai ouvert avant la nouvelle grille se termine à son échéance, sans accès ensuite', async () => {
    await makeUser('ancien');
    await handleBillingEvent(
      subEvent({
        provider: 'simulation',
        subscriptionId: 'sim_ancien',
        customerId: null,
        userId: 'ancien',
        status: 'trialing',
        priceId: 'sim_pro_month',
        trialEnd: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      }),
      repo,
    );
    expect((await repo.getProfile('ancien'))?.plan).toBe('pro');
    expect(await expireSimulatedTrials(repo, new Date(Date.now() + 5 * 86_400_000))).toBe(0);
    expect(await expireSimulatedTrials(repo, new Date(Date.now() + 11 * 86_400_000))).toBe(1);
    expect((await repo.getProfile('ancien'))?.plan).toBe('aucun');
  });

  it('un plan offert par l’admin donne l’accès sans facture ni commission, et se retire', async () => {
    const parrain = await makeUser('parrain');
    const filleul = await makeUser('filleul');
    await applyReferralCode(filleul, parrain.referral_code);
    await grantPlan('filleul', 'elite', repo);
    expect((await repo.getProfile('filleul'))?.plan).toBe('elite');
    expect(await repo.listCommissions('parrain')).toHaveLength(0);
    await grantPlan('filleul', null, repo);
    expect((await repo.getProfile('filleul'))?.plan).toBe('aucun');
  });

  // Corrigé après le signalement de la mise à jour des tests (nouvelle grille).
  it('un plan offert n’envoie pas d’e-mail de confirmation d’abonnement payant', async () => {
    await makeUser('offert');
    await grantPlan('offert', 'elite', repo);
    expect(await mailsTo('offert@test.fr')).toHaveLength(0);
  });
});

describe('base locale : fichier écrit avec l’ancienne grille', () => {
  it('relit « free » comme « aucun » et « proplus » comme « elite » (profils et abonnements)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracktout-grille-'));
    const file = path.join(dir, 'local-db.json');
    try {
      fs.writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          profiles: [
            { id: 'ancien-gratuit', email: 'g@test.fr', plan: 'free', niches: [] },
            { id: 'ancien-plus', email: 'p@test.fr', plan: 'proplus', niches: [] },
            { id: 'pro', email: 'pro@test.fr', plan: 'pro', niches: [] },
          ],
          subscriptions: [
            { id: 'sim_ancien-plus', user_id: 'ancien-plus', provider: 'simulation', status: 'active', plan: 'proplus', billing_interval: 'year' },
          ],
        }),
      );
      const legacy = new LocalRepo(file);
      expect((await legacy.getProfile('ancien-gratuit'))?.plan).toBe('aucun');
      expect((await legacy.getProfile('ancien-plus'))?.plan).toBe('elite');
      expect((await legacy.getProfile('pro'))?.plan).toBe('pro');
      expect((await legacy.getSubscription('sim_ancien-plus'))?.plan).toBe('elite');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
