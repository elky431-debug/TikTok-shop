import { getLiveCatalog } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import { env, isLocalMode } from '@/lib/env';

/**
 * État de santé pour la surveillance (GET /api/health). Ne contient jamais de secret ni de message d'erreur brut :
 * seulement des noms, des booléens et des dates.
 *  - « down » (HTTP 503) : base injoignable, ou dernier relevé de plus de 36 heures ;
 *  - « degraded » (HTTP 200) : repli sur une autre source cette nuit, produits fictifs en production, dernière
 *    tâche en erreur, ou NEXT_PUBLIC_SITE_URL qui pointe encore vers localhost ;
 *  - « ok » sinon.
 */
export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  checkedAt: string;
  database: { kind: 'supabase' | 'local'; ok: boolean };
  data: {
    provider: string;
    /** Les clés du fournisseur choisi sont présentes (sans dire lesquelles). */
    configured: boolean;
    lastUsedProvider: string | null;
    fallbackLastRun: boolean;
  };
  refresh: {
    lastRunAt: string | null;
    lastRunStatus: 'running' | 'ok' | 'error' | null;
    dataDate: string | null;
    refreshedAt: string | null;
    stale: boolean;
    demo: boolean;
  };
  siteUrl: { value: string; ok: boolean };
  /** Fournisseur d'IA des scripts (null = générateur simulé) et forme de sa clé, jamais la clé. */
  ai: { provider: 'openai' | 'anthropic' | null; model: string; keyOk: boolean; keyHints: string[] };
  /**
   * Paiement : présence des variables Stripe (oui/non) et mode de la clé (test ou production, lu dans son préfixe),
   * jamais leurs valeurs ; `otherStripeVariables` : noms d'autres variables STRIPE_* vues (souvent une faute de nom).
   */
  billing: {
    secretKey: boolean;
    keyMode: 'test' | 'live' | null;
    webhookSecret: boolean;
    portalConfiguration: boolean;
    otherStripeVariables: string[];
  };
  problems: string[];
}

const KNOWN_STRIPE_VARIABLES = new Set(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PORTAL_CONFIGURATION']);

function billingStatus(): HealthReport['billing'] {
  const key = env.stripeSecretKey;
  return {
    secretKey: Boolean(key),
    keyMode: key ? (key.startsWith('sk_live') || key.startsWith('rk_live') ? 'live' : 'test') : null,
    webhookSecret: Boolean(env.stripeWebhookSecret),
    portalConfiguration: Boolean(env.stripePortalConfiguration),
    otherStripeVariables: Object.keys(process.env)
      .filter((name) => /^STRIPE/i.test(name) && !KNOWN_STRIPE_VARIABLES.has(name))
      .sort(),
  };
}

function providerConfigured(name: string): boolean {
  if (name === 'tiktok') return Boolean(env.tiktokAppKey && env.tiktokAppSecret && env.tiktokAccessToken);
  if (name === 'nexscope') return Boolean(env.nexscopeApiKey);
  return true;
}

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), ms))]);

export async function healthReport(now: Date = new Date()): Promise<HealthReport> {
  const repo = getRepo();
  const problems: string[] = [];
  // SITE_ID est fourni par Netlify à l'exécution (doc Netlify) : site déployé.
  const production = Boolean(process.env.SITE_ID) || (process.env.NODE_ENV === 'production' && !isLocalMode());

  let databaseOk = true;
  let lastRun: Awaited<ReturnType<typeof repo.listCronRuns>>[number] | undefined;
  let catalog: Awaited<ReturnType<typeof getLiveCatalog>> | null = null;
  try {
    [[lastRun], catalog] = await withTimeout(Promise.all([repo.listCronRuns(1), getLiveCatalog(repo, now)]), 8000);
  } catch {
    databaseOk = false;
    problems.push('base de données injoignable');
  }

  const provider = env.dataProvider;
  const configured = providerConfigured(provider);
  if (!configured) problems.push(`clés du fournisseur « ${provider} » incomplètes`);
  const fallback = Boolean(lastRun?.details?.repli);
  if (fallback) problems.push('repli sur une autre source lors de la dernière tâche');
  if (lastRun?.status === 'error') problems.push('dernière tâche nocturne en erreur');
  if (catalog?.stale) problems.push('dernier relevé de plus de 36 heures');
  if (catalog && !catalog.products.length && databaseOk) problems.push('catalogue vide');
  if (production && catalog?.demo) problems.push('produits fictifs affichés en production');
  const siteOk = !production || !/localhost|127\.0\.0\.1/.test(env.siteUrl);
  if (!siteOk) problems.push('NEXT_PUBLIC_SITE_URL pointe vers localhost');
  const aiProblem = env.aiKeyProblem;
  if (aiProblem) problems.push(aiProblem);
  const billing = billingStatus();
  if (production && !billing.secretKey) problems.push('paiement désactivé : STRIPE_SECRET_KEY absente à l’exécution');
  if (production && billing.secretKey && !billing.webhookSecret) problems.push('STRIPE_WEBHOOK_SECRET absente : les paiements ne mettent pas le plan à jour');

  const down = !databaseOk || Boolean(catalog?.stale);
  return {
    status: down ? 'down' : problems.length ? 'degraded' : 'ok',
    checkedAt: now.toISOString(),
    database: { kind: repo.kind, ok: databaseOk },
    data: {
      provider,
      configured,
      lastUsedProvider: typeof lastRun?.details?.provider === 'string' ? lastRun.details.provider : null,
      fallbackLastRun: fallback,
    },
    refresh: {
      lastRunAt: lastRun?.started_at ?? null,
      lastRunStatus: lastRun?.status ?? null,
      dataDate: catalog?.dataDate ?? null,
      refreshedAt: catalog?.refreshedAt ?? null,
      stale: catalog?.stale ?? false,
      demo: catalog?.demo ?? false,
    },
    siteUrl: { value: env.siteUrl, ok: siteOk },
    ai: { provider: env.aiProvider, model: env.aiModelLabel, keyOk: !aiProblem, keyHints: env.aiKeyHints },
    billing,
    problems,
  };
}
