import Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COACH_COUPON_ID, discountedFirstMonth } from '@/lib/billing/coach-discount';
import { handleBillingEvent } from '@/lib/billing/events';
import { enrichStripeEvent, normalizeStripeEvent, StripeBilling, stripePriceId } from '@/lib/billing/stripe';
import { STRIPE_WEBHOOK_EVENTS } from '@/lib/billing/stripe-config';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { env } from '@/lib/env';
import { applyReferralCode } from '@/lib/referral';

/**
 * Stripe en vrai mode test (clé sk_test_…, prix et coupon formateur créés par « npm run stripe:setup », retrouvés par
 * leur clé de recherche). Pas d'adresse publique pour
 * recevoir les webhooks : les événements produits par Stripe sont relus par l'API (GET /v1/events) et passés au même
 * traitement que la route du webhook. La base est locale ici : le dépôt Supabase est testé à part (repo.test.ts).
 * Tout ce qui est créé chez Stripe (clients, abonnements) est supprimé à la fin.
 */
const key = env.stripeSecretKey;
const ready = key.startsWith('sk_test_');
const consentAt = new Date().toISOString();

describe.skipIf(!ready)('Stripe (mode test réel)', () => {
  // Le corps d'un describe ignoré est quand même lu par Vitest : pas de client sans clé.
  const stripe = ready ? new Stripe(key) : (null as unknown as Stripe);
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
    for (const id of ['eleve', 'echec', 'remise']) {
      const p = await repo.ensureProfile({ id, email: `${id}@example.com` });
      await applyReferralCode(await repo.updateProfile(p.id, { onboarded_at: null }), 'ITEST30');
    }
  });

  afterAll(async () => {
    setRepoForTests(null);
    for (const id of customers) await stripe.customers.del(id).catch(() => undefined);
  });

  it('Checkout mensuel et annuel (avec ou sans code formateur), et portail client, renvoient une page Stripe', async () => {
    const profile = (await repo.getProfile('eleve'))!;
    const billing = new StripeBilling();
    expect(await billing.createCheckout({ profile, plan: 'pro', interval: 'month', coachDiscount: true, consentAt })).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(await billing.createCheckout({ profile, plan: 'pro', interval: 'year', coachDiscount: false, consentAt })).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(await billing.createCheckout({ profile, plan: 'starter', interval: 'month', coachDiscount: false, consentAt })).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const fresh = (await repo.getProfile('eleve'))!;
    customers.push(fresh.stripe_customer_id!);
    expect(await billing.createPortal({ profile: fresh })).toMatch(/^https:\/\/billing\.stripe\.com\//);
  });

  it('Pro → Elite annuel → remboursement → résiliation', async () => {
    const customer = await customerWithCard('eleve', 'pm_card_visa');
    const sub = await stripe.subscriptions.create({
      customer,
      items: [{ price: await stripePriceId('pro', 'month') }],
      metadata: { user_id: 'eleve' },
    });
    await sync(customer, 'invoice.paid');
    expect((await repo.getProfile('eleve'))?.plan).toBe('pro');
    const [first] = await repo.listCommissions('coach');
    expect(first.amount_cents).toBe(Math.round(5999 * 0.3));

    await stripe.subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0].id, price: await stripePriceId('elite', 'year') }],
      proration_behavior: 'always_invoice',
    });
    await sync(customer, 'customer.subscription.updated');
    expect((await repo.getProfile('eleve'))?.plan).toBe('elite');
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
    expect((await repo.getProfile('eleve'))?.plan).toBe('aucun');
  });

  it('un paiement refusé prévient l’abonné', async () => {
    const customer = await customerWithCard('echec', 'pm_card_chargeCustomerFail');
    await stripe.subscriptions.create({
      customer,
      items: [{ price: await stripePriceId('pro', 'month') }],
      payment_behavior: 'allow_incomplete',
      metadata: { user_id: 'echec' },
    });
    await sync(customer, 'invoice.payment_failed');
    if (env.resendKey) return; // avec Resend, l'e-mail part pour de vrai : rien à lire dans la boîte locale
    const mails = (await repo.listLocalEmails!(20)).filter((m) => m.to === 'echec@example.com');
    expect(mails.some((m) => m.subject.includes('n’est pas passé'))).toBe(true);
  });

  it('code formateur : −20 % sur le premier mois seulement, commission de 30 % sur ce qui est payé', async () => {
    const customer = await customerWithCard('remise', 'pm_card_visa');
    const sub = await stripe.subscriptions.create({
      customer,
      items: [{ price: await stripePriceId('starter', 'month') }],
      discounts: [{ coupon: COACH_COUPON_ID }],
      metadata: { user_id: 'remise' },
    });
    await sync(customer, 'invoice.paid');
    expect((await repo.getProfile('remise'))?.plan).toBe('starter');
    const invoice = await stripe.invoices.retrieve(String(sub.latest_invoice));
    expect(invoice.amount_paid).toBe(discountedFirstMonth('starter'));
    const commission = (await repo.listCommissions('coach')).find((c) => c.invoice_id === invoice.id);
    expect(commission?.amount_cents).toBe(Math.round(discountedFirstMonth('starter') * 0.3));
    // Coupon « une fois » : la facture suivante est au plein prix.
    const upcoming = await stripe.invoices.createPreview({ customer, subscription: sub.id });
    expect(upcoming.total).toBe(3499);
  });
});
