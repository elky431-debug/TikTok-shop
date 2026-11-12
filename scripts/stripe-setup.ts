/**
 * Crée dans Stripe les produits « Pro » et « Pro+ » et leurs 4 prix (mensuel et annuel),
 * puis affiche les lignes à copier dans .env.local. Sans effet si les prix existent déjà
 * (recherche par lookup_key).
 *
 * Usage : STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup
 */
import { loadEnvConfig } from '@next/env';
import Stripe from 'stripe';

loadEnvConfig(process.cwd());

const PLANS = [
  { key: 'pro', name: 'Pro', month: 1990, year: 16700, env: ['STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_YEARLY'] },
  { key: 'proplus', name: 'Pro+', month: 3990, year: 33500, env: ['STRIPE_PRICE_PROPLUS_MONTHLY', 'STRIPE_PRICE_PROPLUS_YEARLY'] },
] as const;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error('STRIPE_SECRET_KEY manquant (dans .env.local ou en variable).');
    process.exit(1);
  }
  const stripe = new Stripe(key);
  const lines: string[] = [];
  for (const plan of PLANS) {
    const lookups = [`pepite_${plan.key}_month`, `pepite_${plan.key}_year`];
    const existing = await stripe.prices.list({ lookup_keys: lookups, active: true, limit: 10 });
    let productId = existing.data[0] ? String(existing.data[0].product) : null;
    if (!productId) {
      const product = await stripe.products.create({ name: plan.name, metadata: { plan: plan.key } });
      productId = product.id;
    }
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
      lines.push(`${plan.env[i]}=${price.id}`);
    }
  }
  console.log(`\nMode : ${key.startsWith('sk_live') ? 'PRODUCTION' : 'test'}. Copie ces lignes dans .env.local (et sur Vercel) :\n`);
  console.log(lines.join('\n'));
}

main().catch((error) => {
  console.error('Échec :', error instanceof Error ? error.message : error);
  process.exit(1);
});
