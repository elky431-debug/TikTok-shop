import Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleBillingEvent } from '@/lib/billing/events';
import { enrichStripeEvent, normalizeStripeEvent, StripeBilling } from '@/lib/billing/stripe';
import { STRIPE_WEBHOOK_EVENTS } from '@/lib/billing/stripe-config';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { env } from '@/lib/env';
import { applyReferralCode } from '@/lib/referral';

/**
 * Stripe en vrai mode test (clé sk_test_… et prix créés par « npm run stripe:setup »). Pas d'adresse publique pour
 * recevoir les webhooks : les événements produits par Stripe sont relus par l'API (GET /v1/events) et passés au même
 * traitement que la route du webhook. La base est locale ici : le dépôt Supabase est testé à part (repo.test.ts).
 * Tout ce qui est créé chez Stripe (clients, abonnements) est supprimé à la fin.
 */
const key = env.stripeSecretKey;
const ready = key.startsWith('sk_test_') && Object.values(env.stripePrices).every(Boolean);

describe.skipIf(!ready)('Stripe (mode test réel)', () => {
  const stripe = new Stripe(key);
  const repo = new LocalRepo(null);
  const customers: string[] = [];
  const started = Math.floor(Date.now() / 1000) - 5;
  const seen = new Set<string>();

  /** Rejoue chez nous, dans l'ordre, les événements Stripe de ce client (attend qu'ils apparaissent). */
  async function sync(customer: string, wanted: string, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const events = await stripe.events.list({ created: { gte: started }, types: [...STRIPE_WEBHOOK_EVENTS], limit: 100 });
      const mine = events.data
        .filter((e) => (e.data.object as { customer?: string }).customer === customer && !seen.has(e.id))
        .sort((a, b) => a.created - b.created);
      for (const event of mine) {
        seen.add(event.id);
        await handleBillingEvent(await enrichStripeEvent(normalizeStripeEvent(event as never)), repo);
      }
      if (mine.some((e) => e.type === wanted)) return;
      if (Date.now() > deadline) throw new Error(`événement ${wanted} non reçu`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async function customerWithCard(userId: string, card: string) {
    const customer = await stripe.customers.create({ email: `${userId}@example.com`, metadata: { user_id: userId } });
    customers.push(customer.id);
    const pm = await stripe.paymentMethods.attach(card, { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
    await repo.updateProfile(userId, { stripe_customer_id: customer.id });
    return customer.id;
  }

  beforeAll(async () => {
    setRepoForTests(repo);
    await repo.ensureProfile({ id: 'coach', email: 'coach@example.com' });
    await repo.createCoach({ user_id: 'coach', training_name: 'Formation test', promo_code: 'ITEST30', commission_rate: 0.3 });
    for (const id of ['eleve', 'echec', 'essai']) {
      const p = await repo.ensureProfile({ id, email: `${id}@example.com` });
      await applyReferralCode(await repo.updateProfile(p.id, { onboarded_at: null }), 'ITEST30');
    }
  });

  afterAll(async () => {
    setRepoForTests(null);
    for (const id of customers) await stripe.customers.del(id).catch(() => undefined);
  });

  it('Checkout mensuel et annuel, et portail client, renvoient une page Stripe', async () => {
    const profile = (await repo.getProfile('eleve'))!;
    const billing = new StripeBilling();
    expect(await billing.createCheckout({ profile, plan: 'pro', interval: 'month' })).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(await billing.createCheckout({ profile, plan: 'pro', interval: 'year' })).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const fresh = (await repo.getProfile('eleve'))!;
    customers.push(fresh.stripe_customer_id!);
    expect(await billing.createPortal({ profile: fresh })).toMatch(/^https:\/\/billing\.stripe\.com\//);
  });

  it('Pro → Pro+ annuel → remboursement → résiliation', async () => {
    const customer = await customerWithCard('eleve', 'pm_card_visa');
    const sub = await stripe.subscriptions.create({
      customer,
      items: [{ price: env.stripePrices.pro_month }],
      metadata: { user_id: 'eleve' },
    });
    await sync(customer, 'invoice.paid');
    expect((await repo.getProfile('eleve'))?.plan).toBe('pro');
    const [first] = await repo.listCommissions('coach');
    expect(first.amount_cents).toBe(Math.round(1990 * 0.3));

    await stripe.subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0].id, price: env.stripePrices.proplus_year }],
      proration_behavior: 'always_invoice',
    });
    await sync(customer, 'customer.subscription.updated');
    expect((await repo.getProfile('eleve'))?.plan).toBe('proplus');
    expect((await repo.getSubscription(sub.id))?.billing_interval).toBe('year');

    const payments = await stripe.invoicePayments.list({ invoice: String(sub.latest_invoice), limit: 1 });
    const paymentIntent = payments.data[0]?.payment.payment_intent;
    expect(paymentIntent).toBeTruthy();
    await stripe.refunds.create({ payment_intent: String(typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id) });
    await sync(customer, 'charge.refunded');
    const refunded = (await repo.listCommissions('coach')).find((c) => c.invoice_id === String(sub.latest_invoice));
    expect(refunded).toMatchObject({ status: 'annulee', amount_cents: 0 });

    await stripe.subscriptions.cancel(sub.id);
    await sync(customer, 'customer.subscription.deleted');
    expect((await repo.getProfile('eleve'))?.plan).toBe('free');
  });

  it('un paiement refusé prévient l’abonné', async () => {
    const customer = await customerWithCard('echec', 'pm_card_chargeCustomerFail');
    await stripe.subscriptions.create({
      customer,
      items: [{ price: env.stripePrices.pro_month }],
      payment_behavior: 'allow_incomplete',
      metadata: { user_id: 'echec' },
    });
    await sync(customer, 'invoice.payment_failed');
    if (env.resendKey) return; // avec Resend, l'e-mail part pour de vrai : rien à lire dans la boîte locale
    const mails = (await repo.listLocalEmails!(20)).filter((m) => m.to === 'echec@example.com');
    expect(mails.some((m) => m.subject.includes('n’est pas passé'))).toBe(true);
  });

  it('essai formateur de 3 mois, sans carte', async () => {
    const profile = (await repo.getProfile('essai'))!;
    await new StripeBilling().startTrial({ profile, days: 90 });
    const fresh = (await repo.getProfile('essai'))!;
    customers.push(fresh.stripe_customer_id!);
    expect(fresh).toMatchObject({ plan: 'pro', trial_used: true });
    const sub = await repo.getActiveSubscription('essai');
    expect(sub?.status).toBe('trialing');
    const days = (new Date(sub!.trial_end!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89);
  });
});
