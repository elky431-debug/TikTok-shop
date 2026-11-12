/**
 * Prépare Stripe (mode test conseillé) :
 *  1. produits « Pro » et « Pro+ » et leurs 4 prix (mensuel, annuel), retrouvés par lookup_key : sans doublon ;
 *  2. configuration du portail client (changement de plan avec prorata, résiliation en fin de période, carte,
 *     factures), mise à jour si elle existe ;
 *  3. avec --webhook et une adresse publique https : le point de terminaison du webhook et ses événements. Son secret
 *     (whsec_…) n'est donné qu'à la création : il est écrit dans .env.local, jamais affiché.
 * Puis affiche les identifiants (non secrets) à copier dans .env.local et dans les variables Netlify.
 *
 * Usage : npm run stripe:setup              (STRIPE_SECRET_KEY dans .env.local)
 *         npm run stripe:setup -- --webhook  (NEXT_PUBLIC_SITE_URL = l'adresse publique du site)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEnvConfig } from '@next/env';
import Stripe from 'stripe';

loadEnvConfig(process.cwd());

const PLANS = [
  { key: 'pro', name: 'Pro', month: 1990, year: 16700, env: ['STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_YEARLY'] },
  { key: 'proplus', name: 'Pro+', month: 3990, year: 33500, env: ['STRIPE_PRICE_PROPLUS_MONTHLY', 'STRIPE_PRICE_PROPLUS_YEARLY'] },
] as const;

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
  const { BRAND_SLUG } = await import('@/lib/brand');
  const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
  if (!key) fail('STRIPE_SECRET_KEY manquant (dans .env.local ou en variable). Commence par la clé de test sk_test_….');
  const stripe = new Stripe(key);
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/$/, '') || 'http://localhost:3000';
  const lines: string[] = [];

  // 1. Produits et prix
  const products: Array<{ product: string; prices: string[] }> = [];
  for (const plan of PLANS) {
    const lookups = [`${BRAND_SLUG}_${plan.key}_month`, `${BRAND_SLUG}_${plan.key}_year`];
    const existing = await stripe.prices.list({ lookup_keys: lookups, active: true, limit: 10 });
    let productId = existing.data[0] ? String(existing.data[0].product) : null;
    if (!productId) {
      const product = await stripe.products.create({ name: plan.name, metadata: { plan: plan.key, ...STRIPE_SETUP_METADATA } });
      productId = product.id;
    }
    const prices: string[] = [];
    for (const [i, interval] of (['month', 'year'] as const).entries()) {
      let price = existing.data.find((p) => p.lookup_key === lookups[i]);
      if (!price) {
        price = await stripe.prices.create({
          product: productId,
          currency: 'eur',
          unit_amount: plan[interval],
          recurring: { interval },
          lookup_key: lookups[i],
          metadata: { plan: plan.key },
        });
      }
      prices.push(price.id);
      lines.push(`${plan.env[i]}=${price.id}`);
    }
    products.push({ product: productId, prices });
  }
  console.log('✓ Produits et prix');

  // 2. Portail client
  const params = portalConfiguration({ siteUrl: site, products });
  const configurations = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const mine = configurations.data.find((c) => c.metadata?.app === STRIPE_SETUP_METADATA.app);
  const configuration = mine
    ? await stripe.billingPortal.configurations.update(mine.id, params)
    : await stripe.billingPortal.configurations.create(params);
  lines.push(`STRIPE_PORTAL_CONFIGURATION=${configuration.id}`);
  console.log(`✓ Portail client ${mine ? 'mis à jour' : 'créé'} (changement de plan, résiliation, carte, factures)`);

  // 3. Webhook
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

  console.log(`\nMode : ${key.startsWith('sk_live') ? 'PRODUCTION' : 'test'}. Copie ces lignes dans .env.local (et dans les variables Netlify) :\n`);
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
