import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as webhookRoute } from '@/app/api/stripe/webhook/route';
import { COACH_COUPON_ID } from '@/lib/billing/coach-discount';
import { clearPriceCacheForTests, normalizeStripeEvent, setStripeForTests, StripeBilling } from '@/lib/billing/stripe';
import { BillingUnavailableError } from '@/lib/billing/types';
import { portalConfiguration, STRIPE_WEBHOOK_EVENTS } from '@/lib/billing/stripe-config';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { applyReferralCode } from '@/lib/referral';

/**
 * Parcours Stripe de bout en bout sans clé : vrais webhooks signés envoyés à la vraie route, et un faux serveur Stripe
 * local qui reçoit les vraies requêtes HTTP du SDK officiel (relecture d'abonnement, paiements de facture, portail,
 * Checkout, prix retrouvés par clé de recherche). Les mêmes parcours tournent contre le vrai mode test de Stripe dans
 * tests/integration/stripe.test.ts.
 */

const SECRET = 'whsec_test_parcours';
interface FakePrice {
  id: string;
  lookup_key: string | null;
  metadata?: Record<string, string>;
  interval: 'month' | 'year';
}
/** Prix posés par « npm run stripe:setup » (clé tracktout_<plan>_<période>), plus un prix Pro+ de l'ancienne grille. */
const PRICES = {
  starter_m: { id: 'price_starter_m', lookup_key: 'tracktout_starter_month', interval: 'month' },
  pro_m: { id: 'price_pro_m', lookup_key: 'tracktout_pro_month', interval: 'month' },
  pro_y: { id: 'price_pro_y', lookup_key: 'tracktout_pro_year', interval: 'year' },
  elite_m: { id: 'price_elite_m', lookup_key: 'tracktout_elite_month', interval: 'month' },
  elite_y: { id: 'price_elite_y', lookup_key: 'tracktout_elite_year', interval: 'year' },
  legacy_plus_y: { id: 'price_plus_y', lookup_key: null, metadata: { plan: 'proplus' }, interval: 'year' },
} satisfies Record<string, FakePrice>;

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

function subscription(id: string, price: FakePrice, status = 'active', extra: Record<string, unknown> = {}) {
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
      data: [
        {
          id: `si_${id}`,
          object: 'subscription_item',
          price: { id: price.id, object: 'price', lookup_key: price.lookup_key, metadata: price.metadata ?? {}, recurring: { interval: price.interval } },
          current_period_end: 1_800_000_000,
        },
      ],
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
  if (req.method === 'GET' && path === '/v1/prices') {
    const key = url.searchParams.get('lookup_keys[0]') ?? url.searchParams.get('lookup_keys[]');
    const data = Object.values(PRICES as Record<string, FakePrice>)
      .filter((p) => p.lookup_key && p.lookup_key === key && url.searchParams.get('active') === 'true')
      .map((p) => ({ id: p.id, object: 'price', lookup_key: p.lookup_key, active: true }));
    return { status: 200, json: { object: 'list', data, has_more: false, url: path } };
  }
  if (req.method === 'POST' && path === '/v1/customers') return { status: 200, json: { id: 'cus_new', object: 'customer' } };
  if (req.method === 'POST' && path === '/v1/checkout/sessions') {
    return { status: 200, json: { id: 'cs_1', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_1' } };
  }
  if (req.method === 'POST' && path === '/v1/billing_portal/sessions') {
    return { status: 200, json: { id: 'bps_1', object: 'billing_portal.session', url: 'https://billing.stripe.com/p/session/bps_1' } };
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

const invoice = (id: string, amount: number, extra: Record<string, unknown> = {}, taxes = 0) => ({
  id,
  object: 'invoice',
  customer: 'cus_1',
  amount_paid: amount,
  amount_due: amount,
  total_taxes: taxes ? [{ amount: taxes }] : [],
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
  clearPriceCacheForTests();
  repo = new LocalRepo(null);
  setRepoForTests(repo);
  const coachUser = await repo.ensureProfile({ id: 'coach', email: 'coach@test.fr' });
  await repo.updateProfile(coachUser.id, { onboarded_at: null });
  await repo.createCoach({ user_id: 'coach', training_name: 'Formation Test', promo_code: 'TEST30', commission_rate: 0.3 });
  const eleve = await repo.ensureProfile({ id: 'eleve', email: 'eleve@test.fr' });
  expect((await applyReferralCode(await repo.updateProfile(eleve.id, { onboarded_at: null }), 'TEST30')).kind).toBe('coach');
});

describe('webhooks Stripe signés, traités par la vraie route', () => {
  it('Starter mensuel remisé → Pro mensuel → Elite annuel → résiliation, commission de 30 % sur ce qui est payé HT', async () => {
    expect((await sendWebhook('checkout.session.completed', { id: 'cs_1', customer: 'cus_1', client_reference_id: 'eleve', subscription: 'sub_1' })).status).toBe(200);
    expect((await repo.getProfile('eleve'))?.stripe_customer_id).toBe('cus_1');

    subscription('sub_1', PRICES.starter_m);
    // L'événement porte un état ancien : la route relit l'abonnement chez Stripe, l'état actuel fait foi.
    const created = await sendWebhook('customer.subscription.created', { id: 'sub_1', status: 'incomplete', metadata: { user_id: 'eleve' } });
    expect(created.body).toMatchObject({ status: 'ok', plan: 'starter' });
    expect(requests.some((r) => r.method === 'GET' && r.path === '/v1/subscriptions/sub_1')).toBe(true);

    // Premier mois avec le code formateur : 34,99 € − 20 % = 27,99 € TTC, dont 4,67 € de TVA.
    expect((await sendWebhook('invoice.paid', invoice('in_1', 2799, {}, 467))).body).toMatchObject({ commissionCents: Math.round(2332 * 0.3) });

    subscription('sub_1', PRICES.pro_m);
    expect((await sendWebhook('customer.subscription.updated', { id: 'sub_1' })).body).toMatchObject({ plan: 'pro' });
    expect((await sendWebhook('invoice.paid', invoice('in_2', 5999, {}, 1000))).body).toMatchObject({ commissionCents: Math.round(4999 * 0.3) });

    subscription('sub_1', PRICES.elite_y);
    expect((await sendWebhook('customer.subscription.updated', { id: 'sub_1' })).body).toMatchObject({ plan: 'elite' });
    expect((await repo.getSubscription('sub_1'))?.billing_interval).toBe('year');
    expect((await sendWebhook('invoice.paid', invoice('in_3', 99_990))).body).toMatchObject({ commissionCents: Math.round(99_990 * 0.3) });
    expect((await repo.listReferralsByReferrer('coach'))[0].commission_due_cents).toBe(
      Math.round(2332 * 0.3) + Math.round(4999 * 0.3) + Math.round(99_990 * 0.3),
    );

    subscription('sub_1', PRICES.elite_y, 'canceled');
    expect((await sendWebhook('customer.subscription.deleted', { id: 'sub_1' })).body).toMatchObject({ plan: 'aucun' });
    expect((await repo.listReferralsByReferrer('coach'))[0].status).toBe('resilie');
  });

  it('un abonné de l’ancienne grille (prix Pro+ sans clé, plan en métadonnées) devient Elite', async () => {
    subscription('sub_1', PRICES.legacy_plus_y);
    expect((await sendWebhook('customer.subscription.updated', { id: 'sub_1' })).body).toMatchObject({ status: 'ok', plan: 'elite' });
    expect((await repo.getSubscription('sub_1'))).toMatchObject({ plan: 'elite', billing_interval: 'year', price_id: 'price_plus_y' });
  });

  it('confirme le nouvel abonnement par e-mail, une seule fois, avec la demande de démarrage immédiat', async () => {
    subscription('sub_1', PRICES.pro_m);
    await sendWebhook('customer.subscription.created', { id: 'sub_1' });
    await sendWebhook('customer.subscription.updated', { id: 'sub_1' });
    const mails = (await repo.listLocalEmails!(10)).filter((m) => m.to === 'eleve@test.fr');
    expect(mails.map((m) => m.subject)).toEqual(['Ton abonnement Pro a démarré']);
    expect(mails[0].html).toContain('rétractation');
  });

  it('un remboursement annule la commission au prorata, puis en entier, sans double retrait', async () => {
    subscription('sub_1', PRICES.starter_m);
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
    const failed = invoice('in_echec', 5999, { amount_paid: 0, attempt_count: 1, next_payment_attempt: 1_795_000_000 });
    expect((await sendWebhook('invoice.payment_failed', failed, 'evt_echec')).body).toMatchObject({ status: 'ok', notified: true });
    expect((await sendWebhook('invoice.payment_failed', failed, 'evt_echec')).body).toMatchObject({ status: 'duplicate' });
    const mails = (await repo.listLocalEmails!(10)).filter((m) => m.to === 'eleve@test.fr' && /paiement/.test(m.subject));
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toMatch(/^Ton paiement de 59,99\s€ n’est pas passé$/);
    expect(mails[0].html).toContain('Mettre à jour ma carte');

    subscription('sub_1', PRICES.pro_m, 'past_due');
    expect((await sendWebhook('customer.subscription.updated', { id: 'sub_1' })).body).toMatchObject({ plan: 'pro' });
    subscription('sub_1', PRICES.pro_m, 'unpaid');
    expect((await sendWebhook('customer.subscription.updated', { id: 'sub_1' })).body).toMatchObject({ plan: 'aucun' });
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
  const consentAt = '2026-11-13T10:00:00.000Z';

  it('Checkout mensuel ou annuel pour un compte sans abonnement : prix retrouvé par sa clé, gardé en mémoire', async () => {
    const profile = (await repo.getProfile('eleve'))!;
    const billing = new StripeBilling();
    const url = await billing.createCheckout({ profile, plan: 'pro', interval: 'year', coachDiscount: false, consentAt });
    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_1');
    const lookup = requests.find((r) => r.method === 'GET' && r.path === '/v1/prices')!.query;
    expect(lookup.get('lookup_keys[0]')).toBe('tracktout_pro_year');
    expect(lookup.get('active')).toBe('true');
    const checkout = requests.find((r) => r.path === '/v1/checkout/sessions')!.form;
    expect(checkout.get('mode')).toBe('subscription');
    expect(checkout.get('line_items[0][price]')).toBe(PRICES.pro_y.id);
    expect(checkout.get('client_reference_id')).toBe('eleve');
    expect(checkout.get('subscription_data[metadata][user_id]')).toBe('eleve');
    expect(checkout.get('subscription_data[metadata][demarrage_immediat]')).toBe(consentAt);
    expect(checkout.get('metadata[demarrage_immediat]')).toBe(consentAt);
    expect(checkout.get('allow_promotion_codes')).toBe('true');
    expect(checkout.get('discounts[0][coupon]')).toBeNull();
    expect(checkout.get('custom_text[submit][message]')).toContain('14 jours');
    expect(checkout.get('locale')).toBe('fr');
    expect(checkout.get('success_url')).toMatch(/\/app\?paiement=ok$/);
    expect(checkout.get('cancel_url')).toMatch(/\/abonnement\?paiement=annule$/);

    // Deuxième paiement du même prix : pas de nouvelle recherche chez Stripe.
    await billing.createCheckout({ profile, plan: 'pro', interval: 'year', coachDiscount: false, consentAt });
    expect(requests.filter((r) => r.path === '/v1/prices')).toHaveLength(1);
    expect(requests.filter((r) => r.path === '/v1/checkout/sessions')).toHaveLength(2);
  });

  it('code formateur : coupon −20 % sur le premier mois, sans champ de code promotionnel', async () => {
    const profile = (await repo.getProfile('eleve'))!;
    await new StripeBilling().createCheckout({ profile, plan: 'starter', interval: 'month', coachDiscount: true, consentAt });
    const checkout = requests.find((r) => r.path === '/v1/checkout/sessions')!.form;
    expect(checkout.get('line_items[0][price]')).toBe(PRICES.starter_m.id);
    expect(checkout.get('discounts[0][coupon]')).toBe(COACH_COUPON_ID);
    expect(checkout.get('allow_promotion_codes')).toBeNull();
  });

  it('un prix sans clé de recherche (stripe:setup pas lancé) : paiement indisponible, sans session créée', async () => {
    const profile = (await repo.getProfile('eleve'))!;
    const attempt = new StripeBilling().createCheckout({ profile, plan: 'starter', interval: 'year', coachDiscount: false, consentAt });
    await expect(attempt).rejects.toBeInstanceOf(BillingUnavailableError);
    await expect(new StripeBilling().createCheckout({ profile, plan: 'starter', interval: 'year', coachDiscount: false, consentAt })).rejects.toThrow(
      /tracktout_starter_year/,
    );
    expect(requests.some((r) => r.path === '/v1/checkout/sessions')).toBe(false);
  });

  it('un abonné qui choisit Elite arrive sur la confirmation du nouveau prix dans le portail', async () => {
    subscription('sub_1', PRICES.pro_m);
    await sendWebhook('customer.subscription.created', { id: 'sub_1' });
    const profile = (await repo.getProfile('eleve'))!;
    expect(await new StripeBilling().createCheckout({ profile, plan: 'elite', interval: 'month', coachDiscount: false, consentAt })).toBe(
      'https://billing.stripe.com/p/session/bps_1',
    );
    const portal = requests.find((r) => r.path === '/v1/billing_portal/sessions')!.form;
    expect(portal.get('configuration')).toBe('bpc_tracktout');
    expect(portal.get('flow_data[type]')).toBe('subscription_update_confirm');
    expect(portal.get('flow_data[subscription_update_confirm][subscription]')).toBe('sub_1');
    expect(portal.get('flow_data[subscription_update_confirm][items][0][id]')).toBe('si_sub_1');
    expect(portal.get('flow_data[subscription_update_confirm][items][0][price]')).toBe(PRICES.elite_m.id);
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

  it('plus d’essai formateur : le fournisseur de paiement n’offre plus de démarrage d’essai', () => {
    expect('startTrial' in new StripeBilling()).toBe(false);
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
