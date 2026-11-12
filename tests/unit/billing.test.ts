import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleBillingEvent } from '@/lib/billing/events';
import { expireSimulatedTrials, simulateSubscription } from '@/lib/billing/simulated';
import { normalizeStripeEvent, parseStripeWebhook } from '@/lib/billing/stripe';
import { startCoachTrial } from '@/lib/billing/trial';
import type { SubscriptionChanged } from '@/lib/billing/types';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { applyReferralCode } from '@/lib/referral';

let repo: LocalRepo;

beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
  process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_m';
  process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_y';
  process.env.STRIPE_PRICE_PROPLUS_MONTHLY = 'price_plus_m';
  process.env.STRIPE_PRICE_PROPLUS_YEARLY = 'price_plus_y';
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

describe('normalisation des événements Stripe', () => {
  it('lit un abonnement au format actuel de l’API (période sur la ligne)', () => {
    const event = normalizeStripeEvent({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_9',
          customer: 'cus_9',
          status: 'trialing',
          cancel_at_period_end: false,
          trial_end: 1_900_000_000,
          metadata: { user_id: 'u9' },
          items: { data: [{ current_period_end: 1_900_000_000, price: { id: 'price_plus_y', recurring: { interval: 'year' } } }] },
        },
      },
    });
    expect(event).toMatchObject({
      kind: 'subscription',
      subscriptionId: 'sub_9',
      customerId: 'cus_9',
      userId: 'u9',
      status: 'trialing',
      plan: 'proplus',
      interval: 'year',
      currentPeriodEnd: new Date(1_900_000_000_000).toISOString(),
    });
  });

  it('lit une facture payée (abonnement dans parent, taxes déduites)', () => {
    const event = normalizeStripeEvent({
      id: 'evt_2',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_1',
          customer: 'cus_1',
          amount_paid: 1990,
          total_taxes: [{ amount: 332 }],
          status_transitions: { paid_at: 1_800_000_000 },
          parent: { subscription_details: { subscription: 'sub_1', metadata: { user_id: 'u1' } } },
        },
      },
    });
    expect(event).toMatchObject({ kind: 'invoice_paid', invoiceId: 'in_1', subscriptionId: 'sub_1', userId: 'u1', amountCents: 1658 });
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
      amountCents: 1990,
      paidAt: '2026-11-12T08:00:00.000Z',
    };
    expect(await handleBillingEvent(invoice)).toMatchObject({ status: 'ok', commissionCents: 597 });
    // Même événement rejoué, puis même facture via un autre événement : pas de double commission.
    expect(await handleBillingEvent(invoice)).toMatchObject({ status: 'duplicate' });
    await handleBillingEvent({ ...invoice, eventId: 'evt_inv_1_bis' });
    const commissions = await repo.listCommissions('coach');
    expect(commissions).toHaveLength(1);
    expect(commissions[0]).toMatchObject({ amount_cents: 597, month: '2026-11' });
    const [referral] = await repo.listReferralsByReferrer('coach');
    expect(referral).toMatchObject({ status: 'abonne', commission_due_cents: 597 });
  });

  it('repasse en gratuit à la résiliation', async () => {
    await makeUser('eleve');
    await handleBillingEvent(subEvent());
    await handleBillingEvent(subEvent({ status: 'canceled' }));
    expect((await repo.getProfile('eleve'))?.plan).toBe('free');
  });

  it('garde le meilleur plan si plusieurs abonnements', async () => {
    await makeUser('eleve');
    await handleBillingEvent(subEvent({ subscriptionId: 'sub_a', plan: 'proplus', priceId: 'price_plus_m' }));
    await handleBillingEvent(subEvent({ subscriptionId: 'sub_b', plan: 'pro' }));
    expect((await repo.getProfile('eleve'))?.plan).toBe('proplus');
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
});

describe('essai de 3 mois avec un code formateur', () => {
  it('active Pro sans carte, une seule fois, puis expire', async () => {
    await makeCoach();
    const eleve = await makeUser('eleve');
    await applyReferralCode(eleve, 'TEST30');
    const fresh = (await repo.getProfile('eleve'))!;
    expect(await startCoachTrial(fresh)).toBe(true);
    const after = (await repo.getProfile('eleve'))!;
    expect(after.plan).toBe('pro');
    expect(after.trial_used).toBe(true);
    const sub = await repo.getActiveSubscription('eleve');
    expect(sub?.status).toBe('trialing');
    expect(new Date(sub!.trial_end!).getTime() - Date.now()).toBeGreaterThan(89 * 86_400_000);
    const [referral] = await repo.listReferralsByReferrer('coach');
    expect(referral.status).toBe('essai');

    // Pas de deuxième essai.
    expect(await startCoachTrial(after)).toBe(false);

    // À l'échéance, sans paiement : retour au gratuit.
    expect(await expireSimulatedTrials(repo, new Date(Date.now() + 91 * 86_400_000))).toBe(1);
    expect((await repo.getProfile('eleve'))?.plan).toBe('free');
  });

  it('pas d’essai sans formateur', async () => {
    const user = await makeUser('solo');
    expect(await startCoachTrial(user)).toBe(false);
  });

  it('le paiement simulé passe par le même traitement (plan + commission parrain)', async () => {
    const parrain = await makeUser('parrain');
    const filleul = await makeUser('filleul');
    await applyReferralCode(filleul, parrain.referral_code);
    await simulateSubscription((await repo.getProfile('filleul'))!, 'proplus', 'year', repo);
    expect((await repo.getProfile('filleul'))?.plan).toBe('proplus');
    const [commission] = await repo.listCommissions('parrain');
    expect(commission.amount_cents).toBe(Math.round(33500 * 0.3));
  });
});
