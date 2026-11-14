/**
 * Prépare Stripe à partir des produits et prix créés dans le tableau de bord (rien n'est créé côté catalogue) :
 *  1. retrouve les 6 prix par leur lookup_key (starter_mensuel, starter_annuel, pro_mensuel, pro_annuel, elite_mensuel,
 *     elite_annuel) et vérifie qu'ils correspondent à lib/plans.ts (montant, euros, période). Un écart arrête le script :
 *     corrige le prix dans Stripe (ou lib/plans.ts), puis relance ;
 *  2. configuration du portail client (changement de plan entre ces 6 prix avec prorata, résiliation en fin de période,
 *     carte, factures), mise à jour si elle existe déjà ;
 *  3. avec --webhook : le point de terminaison <site>/api/stripe/webhook et ses événements. Son secret (whsec_…) n'est
 *     donné par Stripe qu'à la création : il est écrit dans .env.local, jamais affiché. Si le point existe déjà et que le
 *     secret n'est pas dans .env.local, il est recréé pour obtenir un nouveau secret ;
 *  4. avec --netlify : STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET et
 *     STRIPE_PORTAL_CONFIGURATION sont enregistrés dans les variables du site Netlify (NETLIFY_AUTH_TOKEN et
 *     NETLIFY_SITE_ID requis, l'identifiant ou l'adresse …netlify.app), sans jamais être affichés ; --redeployer lance
 *     ensuite un nouveau déploiement.
 * Les codes promo (dont ceux des formateurs) se créent dans Stripe : le paiement affiche toujours leur champ.
 *
 * Mode test : --creer-prix-test crée les prix absents (refusé avec une clé de production).
 *
 * Usage : npm run stripe:setup                                   (vérifie les prix, prépare le portail)
 *         npm run stripe:setup -- --webhook --site=https://tracktout.com [--netlify]
 * Variables lues dans l'environnement ou .env.local : STRIPE_SECRET_KEY (sk_test_… d'abord), NEXT_PUBLIC_SITE_URL.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEnvConfig } from '@next/env';
import Stripe from 'stripe';

loadEnvConfig(process.cwd());

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function arg(name: string): string | null {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
}

/** Écrit ou remplace une variable dans .env.local sans jamais afficher sa valeur. */
function writeEnvLocal(name: string, value: string) {
  const file = '.env.local';
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  const next = pattern.test(current) ? current.replace(pattern, line) : `${current.replace(/\n?$/, '\n')}${line}\n`;
  writeFileSync(file, next);
  process.env[name] = value;
}

/** Variable d'un site Netlify (API REST officielle) : créée ou remplacée, pour tous les contextes de déploiement. */
async function setNetlifyVar(token: string, siteRef: string, key: string, value: string) {
  let siteId = siteRef;
  const api = 'https://api.netlify.com/api/v1';
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const site = await fetch(`${api}/sites/${siteId}`, { headers });
  if (!site.ok) throw new Error(`Netlify : site introuvable (${site.status}). Vérifie NETLIFY_SITE_ID et le jeton.`);
  // NETLIFY_SITE_ID peut être l'identifiant du site ou son adresse (…netlify.app) : l'API des variables veut l'identifiant.
  const { account_id: accountId, id } = (await site.json()) as { account_id: string; id: string };
  siteId = id;
  const values = [{ value, context: 'all' }];
  const update = await fetch(`${api}/accounts/${accountId}/env/${key}?site_id=${siteId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ key, scopes: ['builds', 'functions', 'runtime'], values }),
  });
  if (update.ok) return 'mise à jour';
  const create = await fetch(`${api}/accounts/${accountId}/env?site_id=${siteId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify([{ key, scopes: ['builds', 'functions', 'runtime'], values }]),
  });
  if (!create.ok) throw new Error(`Netlify : ${key} non enregistrée (${create.status}).`);
  return 'créée';
}

async function main() {
  const { STRIPE_WEBHOOK_EVENTS, STRIPE_SETUP_METADATA, portalConfiguration } = await import('@/lib/billing/stripe-config');
  const { BRAND_SLUG } = await import('@/lib/brand');
  const { PAID_PLANS, getPlan } = await import('@/lib/plans');
  const { priceLookupKey } = await import('@/lib/billing/prices');
  const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
  if (!key) fail('STRIPE_SECRET_KEY manquant (dans .env.local ou en variable). Commence par la clé de test sk_test_….');
  // Client fetch : il suit le proxy HTTPS quand il y en a un (NODE_USE_ENV_PROXY=1), et marche partout ailleurs.
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  const site = (arg('site') ?? process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/$/, '') || 'http://localhost:3000';

  // 1. Prix créés dans Stripe, retrouvés par lookup_key et comparés à lib/plans.ts
  const wanted = PAID_PLANS.flatMap((plan) => (['month', 'year'] as const).map((interval) => ({ plan, interval, key: priceLookupKey(plan, interval) })));
  const found = await stripe.prices.list({ lookup_keys: wanted.map((w) => w.key), active: true, limit: 20, expand: ['data.product'] });
  const problems: string[] = [];
  const byProduct = new Map<string, string[]>();
  for (const w of wanted) {
    const price = found.data.find((p) => p.lookup_key === w.key);
    const expected = getPlan(w.plan).prices[w.interval];
    if (!price) {
      problems.push(`${w.key} : aucun prix actif avec cette clé de recherche`);
      continue;
    }
    const issues = [
      price.unit_amount !== expected ? `${(price.unit_amount ?? 0) / 100} € au lieu de ${expected / 100} €` : null,
      price.currency !== 'eur' ? `devise ${price.currency}` : null,
      price.recurring?.interval !== w.interval ? `période ${price.recurring?.interval ?? 'aucune'} au lieu de ${w.interval}` : null,
    ].filter(Boolean);
    if (issues.length) problems.push(`${w.key} : ${issues.join(', ')}`);
    const productId = typeof price.product === 'string' ? price.product : price.product.id;
    byProduct.set(productId, [...(byProduct.get(productId) ?? []), price.id]);
    const name = typeof price.product === 'string' ? '' : 'name' in price.product ? price.product.name : '';
    console.log(`✓ ${w.key} : ${(price.unit_amount ?? 0) / 100} € / ${w.interval === 'month' ? 'mois' : 'an'}${name ? ` (${name})` : ''}`);
  }
  // Mode test seulement : --creer-prix-test crée les prix absents (même clé de recherche, montants de lib/plans.ts).
  const missing = wanted.filter((w) => !found.data.some((p) => p.lookup_key === w.key));
  if (missing.length && process.argv.includes('--creer-prix-test')) {
    if (!key.startsWith('sk_test')) fail('--creer-prix-test refuse une clé de production : crée tes prix dans le tableau de bord Stripe.');
    const productIds = new Map<string, string>();
    for (const w of missing) {
      const plan = getPlan(w.plan);
      let productId = productIds.get(w.plan) ?? found.data.find((p) => p.lookup_key?.startsWith(`${w.plan}_`))?.product;
      if (typeof productId !== 'string' || !productId) {
        const product = await stripe.products.create({ name: `${BRAND_SLUG === 'tracktout' ? 'Tracktout' : BRAND_SLUG} ${plan.name}`, metadata: { ...STRIPE_SETUP_METADATA, plan: w.plan } });
        productId = product.id;
      }
      productIds.set(w.plan, productId);
      const price = await stripe.prices.create({
        product: productId,
        currency: 'eur',
        unit_amount: plan.prices[w.interval],
        recurring: { interval: w.interval },
        lookup_key: w.key,
        metadata: { ...STRIPE_SETUP_METADATA, plan: w.plan },
        expand: ['product'],
      });
      found.data.push(price);
      console.log(`✓ ${w.key} créé en mode test : ${(price.unit_amount ?? 0) / 100} € / ${w.interval === 'month' ? 'mois' : 'an'}`);
    }
    problems.splice(0, problems.length, ...problems.filter((p) => !missing.some((m) => p.startsWith(`${m.key} :`))));
    byProduct.clear();
    for (const price of found.data) {
      const productId = typeof price.product === 'string' ? price.product : price.product.id;
      byProduct.set(productId, [...(byProduct.get(productId) ?? []), price.id]);
    }
  }
  if (problems.length) fail(`Prix à corriger dans Stripe avant de continuer :\n  - ${problems.join('\n  - ')}${missing.length ? '\n  (en mode test : relance avec -- --creer-prix-test pour créer les prix absents)' : ''}`);
  const products = [...byProduct.entries()].map(([product, prices]) => ({ product, prices }));

  // 2. Portail client
  const params = portalConfiguration({ siteUrl: site, products });
  const configurations = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const mine = configurations.data.find((c) => c.metadata?.app === STRIPE_SETUP_METADATA.app);
  const configuration = mine
    ? await stripe.billingPortal.configurations.update(mine.id, params)
    : await stripe.billingPortal.configurations.create(params);
  writeEnvLocal('STRIPE_PORTAL_CONFIGURATION', configuration.id);
  console.log(`✓ Portail client ${mine ? 'mis à jour' : 'créé'} (changement de plan, résiliation, carte, factures)`);

  // 3. Webhook
  const url = `${site}/api/stripe/webhook`;
  if (process.argv.includes('--webhook')) {
    if (!/^https:\/\//.test(site) || /localhost|127\.0\.0\.1/.test(site)) {
      fail('--webhook demande une adresse publique https (--site=https://… ou NEXT_PUBLIC_SITE_URL). En local : « stripe listen ».');
    }
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const existing = endpoints.data.find((e) => e.url === url);
    const haveSecret = Boolean((process.env.STRIPE_WEBHOOK_SECRET ?? '').trim());
    if (existing && haveSecret) {
      await stripe.webhookEndpoints.update(existing.id, { enabled_events: [...STRIPE_WEBHOOK_EVENTS], disabled: false });
      console.log(`✓ Webhook existant mis à jour (${url}) : le secret déjà en place reste valable.`);
    } else {
      if (existing) await stripe.webhookEndpoints.del(existing.id);
      const created = await stripe.webhookEndpoints.create({
        url,
        enabled_events: [...STRIPE_WEBHOOK_EVENTS],
        description: `${BRAND_SLUG} : abonnements, factures, remboursements`,
        metadata: STRIPE_SETUP_METADATA,
      });
      if (!created.secret) fail('Stripe n’a pas renvoyé le secret du webhook.');
      writeEnvLocal('STRIPE_WEBHOOK_SECRET', created.secret);
      console.log(`✓ Webhook ${existing ? 'recréé' : 'créé'} (${url}) ; son secret est dans .env.local (STRIPE_WEBHOOK_SECRET).`);
    }
  }

  // 4. Variables Netlify
  if (process.argv.includes('--netlify')) {
    const token = (process.env.NETLIFY_AUTH_TOKEN ?? '').trim();
    const siteId = (process.env.NETLIFY_SITE_ID ?? '').trim();
    if (!token || !siteId) fail('--netlify demande NETLIFY_AUTH_TOKEN et NETLIFY_SITE_ID (Netlify → Site configuration → Site ID).');
    // Clés Stripe comprises : le site en ligne doit les voir à l'exécution (fonctions) comme à la construction.
    for (const name of ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PORTAL_CONFIGURATION']) {
      const value = (process.env[name] ?? '').trim();
      if (!value) continue;
      console.log(`✓ Netlify : ${name} ${await setNetlifyVar(token, siteId, name, value)} (valeur non affichée)`);
    }
    if (process.argv.includes('--redeployer')) {
      const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/builds`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      console.log(res.ok ? '✓ Netlify : nouveau déploiement lancé' : `✗ Netlify : redéploiement refusé (${res.status}) ; lance-le depuis Netlify.`);
    } else {
      console.log('  Redéploie le site pour que les nouvelles valeurs soient prises en compte (ou relance avec --redeployer).');
    }
  }

  console.log(`\nMode : ${key.startsWith('sk_live') ? 'PRODUCTION' : 'test'}. Prix retrouvés par leur lookup_key.`);
  if (!process.argv.includes('--webhook')) {
    console.log(
      `Webhook : relance avec « -- --webhook --site=https://… » (et --netlify pour l'enregistrer sur Netlify), ou crée-le\n` +
        `à la main (Developers → Webhooks) sur ${url} avec : ${STRIPE_WEBHOOK_EVENTS.join(', ')}.`,
    );
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
