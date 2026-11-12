import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as webhookRoute } from '@/app/api/stripe/webhook/route';
import { normalizeStripeEvent, setStripeForTests, StripeBilling } from '@/lib/billing/stripe';
import { portalConfiguration, STRIPE_WEBHOOK_EVENTS } from '@/lib/billing/stripe-config';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { applyReferralCode } from '@/lib/referral';

/**
 * Parcours Stripe de bout en bout sans clé : vrais webhooks signés envoyés à la vraie route, et un faux serveur Stripe
 * local qui reçoit les vraies requêtes HTTP du SDK officiel (relecture d'abonnement, paiements de facture, portail,
 * Checkout, essai). Les mêmes parcours tournent contre le vrai mode test de Stripe dans tests/integration/stripe.test.ts.
 */

const SECRET = 'whsec_test_parcours';
const PRICES = { pro_m: 'price_pro_m', pro_y: 'price_pro_y', plus_m: 'price_plus_m', plus_y: 'price_plus_y' };

interface Recorded {
  method: string;
  path: string;
  query: URLSearchParams;
  form: URLSearchParams;
}

let server: Server;
let requests: Recorded[] = [];
/** État des abonnements tel que Stripe le renverrait. */
const subscriptions = new Map<string, Record<string, unknown>>();
let repo: LocalRepo;

function subscription(id: string, price: string, status = 'active', extra: Record<string, unknown> = {}) {
  const interval = price.endsWith('_y') ? 'year' : 'month';
  const sub = {
    id,
    object: 'subscription',
    customer: 'cus_1',
    status,
    metadata: { user_id: 'eleve' },
    cancel_at_period_end: false,
    trial_end: null,
    items: {
      object: 'list',
      data: [{ id: `si_${id}`, object: 'subscription_item', price: { id: price, recurring: { interval } }, current_period_end: 1_800_000_000 }],
    },
    ...extra,
  };
  subscriptions.set(id, sub);
  return sub;
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

function fakeStripe(req: IncomingMessage, body: string): { status: number; json: unknown } {
  const url = new URL(req.url ?? '/', 'http://stripe.local');
  const form = new URLSearchParams(body);
  requests.push({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, form });
  const path = url.pathname;
  if (req.method === 'GET' && path.startsWith('/v1/subscriptions/')) {
    const sub = subscriptions.get(path.split('/').pop()!);
    return sub ? { status: 200, json: sub } : { status: 404, json: { error: { type: 'invalid_request_error', message: 'No such subscription' } } };
  }
  if (req.method === 'GET' && path === '/v1/invoice_payments') {
    const pi = url.searchParams.get('payment[payment_intent]');
    const data = pi === 'pi_1' ? [{ id: 'inpay_1', object: 'invoice_payment', invoice: 'in_1', status: 'paid' }] : [];
    return { status: 200, json: { object: 'list', data, has_more: false, url: path } };
  }
  if (req.method === 'POST' && path === '/v1/customers') return { status: 200, json: { id: 'cus_new', object: 'customer' } };
  if (req.method === 'POST' && path === '/v1/checkout/sessions') {
    return { status: 200, json: { id: 'cs_1', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_1' } };
  }
  if (req.method === 'POST' && path === '/v1/billing_portal/sessions') {
    return { status: 200, json: { id: 'bps_1', object: 'billing_portal.session', url: 'https://billing.stripe.com/p/session/bps_1' } };
  }
  if (req.method === 'POST' && path === '/v1/subscriptions') {
    const sub = subscription('sub_essai', form.get('items[0][price]') ?? '', 'trialing', {
      customer: form.get('customer'),
      metadata: { user_id: form.get('metadata[user_id]') },
      trial_end: Math.floor(Date.now() / 1000) + 90 * 86_400,
    });
    return { status: 200, json: sub };
  }
  return { status: 404, json: { error: { type: 'invalid_request_error', message: `route inconnue ${req.method} ${path}` } } };
}

async function sendWebhook(type: string, object: Record<string, unknown>, id = `evt_${Math.random().toString(36).slice(2)}`) {
  const payload = JSON.stringify({ id, object: 'event', type, data: { object } });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  const response = await webhookRoute(
    new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const invoice = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id,
  object: 'invoice',
  customer: 'cus_1',
  amount_paid: amount,
  amount_due: amount,
  total_taxes: [],
  status_transitions: { paid_at: 1_794_480_000 },
  parent: { subscription_details: { subscription: 'sub_1', metadata: { user_id: 'eleve' } } },
  ...extra,
});

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const { status, json } = fakeStripe(req, await readBody(req));
    res.writeHead(status, { 'content-type': 'application/json', 'request-id': 'req_test' });
    res.end(JSON.stringify(json));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  setStripeForTests(new Stripe('sk_test_factice', { host: '127.0.0.1', port, protocol: 'http', maxNetworkRetries: 0 }));
  Object.assign(process.env, {
    STRIPE_WEBHOOK_SECRET: SECRET,
    STRIPE_PRICE_PRO_MONTHLY: PRICES.pro_m,
    STRIPE_PRICE_PRO_YEARLY: PRICES.pro_y,
    STRIPE_PRICE_PROPLUS_MONTHLY: PRICES.plus_m,
    STRIPE_PRICE_PROPLUS_YEARLY: PRICES.plus_y,
    STRIPE_PORTAL_CONFIGURATION: 'bpc_tracktout',
  });
});

afterAll(async () => {
  setStripeForTests(null);
  setRepoForTests(null);
  for (const k of ['STRIPE_WEBHOOK_SECRET', 'STRIPE_PORTAL_CONFIGURATION']) process.env[k] = '';
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  requests = [];
  subscriptions.clear();
  repo = new LocalRepo(null);
  setRepoForTests(repo);
  const coachUser = await repo.ensureProfile({ id: 'coach', email: 'coach@test.fr' });
  await repo.updateProfile(coachUser.id, { onboarded_at: null });
  await repo.createCoach({ user_id: 'coach', training_name: 'Formation Test', promo_code: 'TEST30', commission_rate: 0.3 });
  const eleve = await repo.ensureProfile({ id: 'eleve', email: 'eleve@test.fr' });
  expect((await applyReferralCode(await repo.updateProfile(eleve.id, { onboarded_at: null }), 'TEST30')).kind).toBe('coach');
});

describe('webhooks Stripe signés, traités par la vraie route', () => {
  it('Gratuit → Pro mensuel → Pro+ annuel → résiliation, avec la commission du formateur', async () => {
    expect((await sendWebhook('checkout.session.completed', { id: 'cs_1', customer: 'cus_1', client_reference_id: 'eleve', subscription: 'sub_1' })).status).toBe(200);
    expect((await repo.getProfile('eleve'))?.stripe_customer_id).toBe('cus_1');

    subscription('sub_1', PRICES.pro_m);
    // L'événement porte un état ancien : la route relit l'abonnement chez Stripe, l'état actuel fait foi.
    const created = await sendWebhook('customer.subscription.created', { id: 'sub_1', status: 'incomplete', metadata: { user_id: 'eleve' } });
    expect(created.body).toMatchObject({ status: 'ok', plan: 'pro' });
    expect(requests.some((r) => r.method === 'GET' && r.path === '/v1/subscriptions/sub_1')).toBe(true);

    expect((await sendWebhook('invoice.paid', invoice('in_1', 1990))).body).toMatchObject({ commissionCents: 597 });

    subscription('sub_1', PRICES.plus_y);
    expect((await sendWebhook('customer.subscription.updated', { id: 'sub_1' })).body).toMatchObject({ plan: 'proplus' });
    expect((await repo.getSubscription('sub_1'))?.billing_interval).toBe('year');
    expect((await sendWebhook('invoice.paid', invoice('in_2', 33_500))).body).toMatchObject({ commissionCents: 10_050 });
    expect((await repo.listReferralsByReferrer('coach'))[0].commission_due_cents).toBe(597 + 10_050);

    subscription('sub_1', PRICES.plus_y, 'canceled');
    expect((await sendWebhook('customer.subscription.deleted', { id: 'sub_1' })).body).toMatchObject({ plan: 'free' });
    expect((await repo.listReferralsByReferrer('coach'))[0].status).toBe('resilie');
  });

  it('un remboursement annule la commission au prorata, puis en entier, sans double retrait', async () => {
    subscription('sub_1', PRICES.pro_m);
    await sendWebhook('customer.subscription.created', { id: 'sub_1' });
    await sendWebhook('invoice.paid', invoice('in_1', 1990));
    const charge = { id: 'ch_1', object: 'charge', customer: 'cus_1', payment_intent: 'pi_1', amount: 1990, refunded: false };

    const half = await sendWebhook('charge.refunded', { ...charge, amount_refunded: 995 });
    expect(half.body).toMatchObject({ status: 'ok', canceledCents: 299, remainingCents: 298 });
    const lookup = requests.find((r) => r.path === '/v1/invoice_payments')!;
    expect(lookup.query.get('payment[type]')).toBe('payment_intent');
    expect(lookup.query.get('payment[payment_intent]')).toBe('pi_1');

    const full = await sendWebhook('charge.refunded', { ...charge, amount_refunded: 1990, refunded: true }, 'evt_full');
    expect(full.body).toMatchObject({ canceledCents: 597, remainingCents: 0 });
    expect((await sendWebhook('charge.refunded', { ...charge, amount_refunded: 1990, refunded: true }, 'evt_full')).body.status).toBe('duplicate');

    const [commission] = await repo.listCommissions('coach');
    expect(commission).toMatchObject({ status: 'annulee', amount_cents: 0, canceled_cents: 597 });
    expect((await repo.listReferralsByReferrer('coach'))[0].commission_due_cents).toBe(0);
    // Un paiement sans facture d'abonnement (aucun paiement de facture trouvé) ne touche à rien.
    expect((await sendWebhook('charge.refunded', { ...charge, payment_intent: 'pi_autre', amount_refunded: 500 })).body).toMatchObject({ canceledCents: 0 });
  });

  it('un échec de paiement garde l’accès pendant les nouveaux essais et prévient l’abonné une seule fois', async () => {
    subscription('sub_1', PRICES.pro_m);
    await sendWebhook('customer.subscription.created', { id: 'sub_1' });
    const failed = invoice('in_echec', 1990, { amount_paid: 0, attempt_count: 1, next_payment_attempt: 1_795_000_000 });
    expect((await sendWebhook('invoice.payment_failed', failed, 'evt_echec')).body).toMatchObject({ status: 'ok', notified: true });
    expect((await sendWebhook('invoice.payment_failed', failed, 'evt_echec')).body).toMatchObject({ status: 'duplicate' });
    const mails = (await repo.listLocalEmails!(10)).filter((m) => m.to === 'eleve@test.fr');
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toMatch(/^Ton paiement de 19,90\s€ n’est pas passé$/);
    expect(mails[0].html).toContain('Mettre à jour ma carte');

    subscription('sub_1', PRICES.pro_m, 'past_due');
    expect((await sendWebhook('customer.subscription.updated', { id: 'sub_1' })).body).toMatchObject({ plan: 'pro' });
    subscription('sub_1', PRICES.pro_m, 'unpaid');
    expect((await sendWebhook('customer.subscription.updated', { id: 'sub_1' })).body).toMatchObject({ plan: 'free' });
  });

  it('refuse un webhook mal signé', async () => {
    const payload = JSON.stringify({ id: 'evt_x', object: 'event', type: 'invoice.paid', data: { object: invoice('in_x', 1990) } });
    const forged = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_pirate' });
    const response = await webhookRoute(new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': forged } }));
    expect(response.status).toBe(400);
    expect(await repo.listCommissions('coach')).toHaveLength(0);
  });
});

describe('requêtes envoyées à Stripe', () => {
  it('Checkout mensuel ou annuel pour un compte gratuit', async () => {
    const profile = (await repo.getProfile('eleve'))!;
    const url = await new StripeBilling().createCheckout({ profile, plan: 'pro', interval: 'year' });
    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_1');
    const checkout = requests.find((r) => r.path === '/v1/checkout/sessions')!.form;
    expect(checkout.get('mode')).toBe('subscription');
    expect(checkout.get('line_items[0][price]')).toBe(PRICES.pro_y);
    expect(checkout.get('client_reference_id')).toBe('eleve');
    expect(checkout.get('subscription_data[metadata][user_id]')).toBe('eleve');
    expect(checkout.get('locale')).toBe('fr');
  });

  it('un abonné qui choisit Pro+ arrive sur la confirmation du nouveau prix dans le portail', async () => {
    subscription('sub_1', PRICES.pro_m);
    await sendWebhook('customer.subscription.created', { id: 'sub_1' });
    const profile = (await repo.getProfile('eleve'))!;
    expect(await new StripeBilling().createCheckout({ profile, plan: 'proplus', interval: 'month' })).toBe('https://billing.stripe.com/p/session/bps_1');
    const portal = requests.find((r) => r.path === '/v1/billing_portal/sessions')!.form;
    expect(portal.get('configuration')).toBe('bpc_tracktout');
    expect(portal.get('flow_data[type]')).toBe('subscription_update_confirm');
    expect(portal.get('flow_data[subscription_update_confirm][subscription]')).toBe('sub_1');
    expect(portal.get('flow_data[subscription_update_confirm][items][0][id]')).toBe('si_sub_1');
    expect(portal.get('flow_data[subscription_update_confirm][items][0][price]')).toBe(PRICES.plus_m);
    expect(requests.some((r) => r.path === '/v1/checkout/sessions')).toBe(false);
  });

  it('le bouton « Mettre à jour ma carte » ouvre directement l’étape du portail', async () => {
    await repo.updateProfile('eleve', { stripe_customer_id: 'cus_1' });
    const profile = (await repo.getProfile('eleve'))!;
    await new StripeBilling().createPortal({ profile, flow: 'payment_method_update' });
    const portal = requests.find((r) => r.path === '/v1/billing_portal/sessions')!.form;
    expect(portal.get('customer')).toBe('cus_1');
    expect(portal.get('flow_data[type]')).toBe('payment_method_update');
  });

  it('essai formateur de 3 mois sans carte, annulé tout seul sans moyen de paiement', async () => {
    const profile = (await repo.getProfile('eleve'))!;
    await new StripeBilling().startTrial({ profile, days: 90 });
    const created = requests.find((r) => r.method === 'POST' && r.path === '/v1/subscriptions')!.form;
    expect(created.get('trial_period_days')).toBe('90');
    expect(created.get('trial_settings[end_behavior][missing_payment_method]')).toBe('cancel');
    expect(created.get('items[0][price]')).toBe(PRICES.pro_m);
    const after = (await repo.getProfile('eleve'))!;
    expect(after).toMatchObject({ plan: 'pro', trial_used: true });
  });
});

describe('réglages créés par npm run stripe:setup', () => {
  it('chaque événement du webhook est traité', () => {
    for (const type of STRIPE_WEBHOOK_EVENTS) {
      expect(normalizeStripeEvent({ id: 'e', type, data: { object: { id: 'x', items: { data: [] } } } }).kind, type).not.toBe('ignored');
    }
  });

  it('portail : changement de plan avec prorata, résiliation en fin de période', () => {
    const config = portalConfiguration({ siteUrl: 'https://tracktout.com/', products: [{ product: 'prod_pro', prices: ['a', 'b'] }] });
    expect(config.default_return_url).toBe('https://tracktout.com/app/compte');
    expect(config.features.subscription_update).toMatchObject({ enabled: true, default_allowed_updates: ['price'], proration_behavior: 'create_prorations' });
    expect(config.features.subscription_cancel).toMatchObject({ enabled: true, mode: 'at_period_end' });
    expect(config.business_profile).toEqual({ privacy_policy_url: 'https://tracktout.com/confidentialite', terms_of_service_url: 'https://tracktout.com/cgv' });
  });
});
