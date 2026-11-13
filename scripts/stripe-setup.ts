/**
 * Prépare Stripe (mode test conseillé), sans doublon si on le relance :
 *  1. produits Starter, Pro et Elite et leurs 6 prix (mensuel, annuel) aux montants de lib/plans.ts, retrouvés par
 *     lookup_key (`tracktout_<plan>_<month|year>`). Si un montant a changé, un nouveau prix reprend la clé
 *     (transfer_lookup_key) et l'ancien est archivé : les abonnés en cours le gardent. Les prix de l'ancien plan
 *     « Pro+ » sont archivés ;
 *  2. le coupon du code formateur (−20 % sur le premier mois, une seule fois) ;
 *  3. configuration du portail client (changement de plan avec prorata, résiliation en fin de période, carte,
 *     factures), mise à jour si elle existe ;
 *  4. avec --webhook et une adresse publique https : le point de terminaison du webhook et ses événements. Son secret
 *     (whsec_…) n'est donné qu'à la création : il est écrit dans .env.local, jamais affiché.
 * L'appli retrouve les prix par leur lookup_key : aucun identifiant de prix à recopier. Seul
 * STRIPE_PORTAL_CONFIGURATION (non secret) est affiché, à copier dans .env.local et dans les variables Netlify.
 *
 * Usage : npm run stripe:setup              (STRIPE_SECRET_KEY dans .env.local)
 *         npm run stripe:setup -- --webhook  (NEXT_PUBLIC_SITE_URL = l'adresse publique du site)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEnvConfig } from '@next/env';
import Stripe from 'stripe';

loadEnvConfig(process.cwd());

/** Plans de l'ancienne grille dont les prix sont archivés. */
const RETIRED_PLANS = ['proplus'] as const;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Écrit ou remplace une variable dans .env.local sans jamais afficher sa valeur. */
function writeEnvLocal(name: string, value: string) {
  const file = '.env.local';
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  const next = pattern.test(current) ? current.replace(pattern, line) : `${current.replace(/\n?$/, '\n')}${line}\n`;
  writeFileSync(file, next);
}

async function main() {
  const { STRIPE_WEBHOOK_EVENTS, STRIPE_SETUP_METADATA, portalConfiguration } = await import('@/lib/billing/stripe-config');
  const { BRAND, BRAND_SLUG } = await import('@/lib/brand');
  const { PAID_PLANS, getPlan, COACH_FIRST_MONTH_DISCOUNT } = await import('@/lib/plans');
  const { priceLookupKey } = await import('@/lib/billing/prices');
  const { COACH_COUPON_ID } = await import('@/lib/billing/coach-discount');
  const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
  if (!key) fail('STRIPE_SECRET_KEY manquant (dans .env.local ou en variable). Commence par la clé de test sk_test_….');
  const stripe = new Stripe(key);
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/$/, '') || 'http://localhost:3000';
  const lines: string[] = [];

  // 1. Produits et prix
  const allProducts = await stripe.products.list({ active: true, limit: 100 });
  const products: Array<{ product: string; prices: string[] }> = [];
  for (const planId of PAID_PLANS) {
    const plan = getPlan(planId);
    const name = `${BRAND} ${plan.name}`;
    const lookups = (['month', 'year'] as const).map((interval) => priceLookupKey(planId, interval));
    const existing = await stripe.prices.list({ lookup_keys: lookups, active: true, limit: 10 });
    let productId =
      allProducts.data.find((p) => p.metadata?.app === STRIPE_SETUP_METADATA.app && p.metadata?.plan === planId)?.id ??
      (existing.data[0] ? String(existing.data[0].product) : null);
    if (productId) {
      await stripe.products.update(productId, { name, metadata: { plan: planId, ...STRIPE_SETUP_METADATA } });
    } else {
      productId = (await stripe.products.create({ name, metadata: { plan: planId, ...STRIPE_SETUP_METADATA } })).id;
    }
    const prices: string[] = [];
    for (const [i, interval] of (['month', 'year'] as const).entries()) {
      const amount = plan.prices[interval];
      let price = existing.data.find((p) => p.lookup_key === lookups[i]);
      if (!price || price.unit_amount !== amount || String(price.product) !== productId) {
        const previous = price;
        price = await stripe.prices.create({
          product: productId,
          currency: 'eur',
          unit_amount: amount,
          recurring: { interval },
          lookup_key: lookups[i],
          transfer_lookup_key: true,
          tax_behavior: 'inclusive',
          metadata: { plan: planId },
        });
        // Ancien montant : archivé (les abonnés en cours le gardent, plus personne ne peut le choisir).
        if (previous) await stripe.prices.update(previous.id, { active: false });
      }
      prices.push(price.id);
    }
    products.push({ product: productId, prices });
    console.log(`✓ ${name} : ${(plan.prices.month / 100).toFixed(2)} €/mois, ${(plan.prices.year / 100).toFixed(2)} €/an`);
  }
  // Ancienne grille : prix archivés, produit désactivé.
  for (const retired of RETIRED_PLANS) {
    const old = await stripe.prices.list({ lookup_keys: [`${BRAND_SLUG}_${retired}_month`, `${BRAND_SLUG}_${retired}_year`], active: true, limit: 10 });
    for (const price of old.data) await stripe.prices.update(price.id, { active: false });
    const product = allProducts.data.find((p) => p.metadata?.plan === retired && p.metadata?.app === STRIPE_SETUP_METADATA.app);
    if (product) await stripe.products.update(product.id, { active: false });
    if (old.data.length || product) console.log(`✓ Ancien plan « ${retired} » archivé`);
  }

  // 2. Coupon du code formateur
  const percent = Math.round(COACH_FIRST_MONTH_DISCOUNT * 100);
  const coupon = await stripe.coupons.retrieve(COACH_COUPON_ID).catch(() => null);
  if (!coupon || coupon.deleted) {
    await stripe.coupons.create({
      id: COACH_COUPON_ID,
      name: `Code formateur : −${percent} % sur le premier mois`,
      percent_off: percent,
      duration: 'once',
      metadata: STRIPE_SETUP_METADATA,
    });
    console.log(`✓ Coupon formateur créé (−${percent} % le premier mois)`);
  } else if (coupon.percent_off !== percent || coupon.duration !== 'once') {
    fail(`Le coupon ${COACH_COUPON_ID} existe avec d'autres conditions : supprime-le dans Stripe puis relance.`);
  } else {
    console.log(`✓ Coupon formateur déjà en place (−${percent} % le premier mois)`);
  }

  // 3. Portail client
  const params = portalConfiguration({ siteUrl: site, products });
  const configurations = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const mine = configurations.data.find((c) => c.metadata?.app === STRIPE_SETUP_METADATA.app);
  const configuration = mine
    ? await stripe.billingPortal.configurations.update(mine.id, params)
    : await stripe.billingPortal.configurations.create(params);
  lines.push(`STRIPE_PORTAL_CONFIGURATION=${configuration.id}`);
  console.log(`✓ Portail client ${mine ? 'mis à jour' : 'créé'} (changement de plan, résiliation, carte, factures)`);

  // 4. Webhook
  const url = `${site}/api/stripe/webhook`;
  if (process.argv.includes('--webhook')) {
    if (!/^https:\/\//.test(site) || /localhost|127\.0\.0\.1/.test(site)) {
      fail('--webhook demande une adresse publique https dans NEXT_PUBLIC_SITE_URL (en local, utilise « stripe listen »).');
    }
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const existing = endpoints.data.find((e) => e.url === url);
    if (existing) {
      await stripe.webhookEndpoints.update(existing.id, { enabled_events: [...STRIPE_WEBHOOK_EVENTS] });
      console.log(`✓ Webhook existant mis à jour (${url}) : garde le STRIPE_WEBHOOK_SECRET déjà en place.`);
    } else {
      const created = await stripe.webhookEndpoints.create({
        url,
        enabled_events: [...STRIPE_WEBHOOK_EVENTS],
        description: `${BRAND_SLUG} : abonnements, factures, remboursements`,
        metadata: STRIPE_SETUP_METADATA,
      });
      if (created.secret) writeEnvLocal('STRIPE_WEBHOOK_SECRET', created.secret);
      console.log(`✓ Webhook créé (${url}). Son secret est dans .env.local (STRIPE_WEBHOOK_SECRET) : copie-le dans Netlify.`);
    }
  }

  console.log(
    `\nMode : ${key.startsWith('sk_live') ? 'PRODUCTION' : 'test'}. Les prix sont retrouvés par leur lookup_key. ` +
      'Copie cette ligne dans .env.local (et dans les variables Netlify) :\n',
  );
  console.log(lines.join('\n'));
  if (!process.argv.includes('--webhook')) {
    console.log(
      `\nWebhook : relance avec « -- --webhook » une fois le site en ligne, ou crée-le à la main (Developers → Webhooks)\n` +
        `sur ${url} avec ces événements : ${STRIPE_WEBHOOK_EVENTS.join(', ')}.\n` +
        'En local : stripe listen --forward-to localhost:3000/api/stripe/webhook (secret affiché par la CLI Stripe).',
    );
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
