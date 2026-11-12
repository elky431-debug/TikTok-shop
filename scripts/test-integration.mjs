/**
 * npm run test:integration : tests contre les vrais services (Vitest), puis parcours de connexion (Playwright).
 * Chaque fichier de test se lance seulement si les clés de son service sont là (Supabase, Resend, Stripe, Discord,
 * Nexscope…). Sans aucune clé, rien n'est lancé : le script le dit et sort sans erreur, sauf si
 * INTEGRATION_REQUIRED=1 (utile en CI pour ne pas prendre un saut pour une réussite).
 */
import { spawnSync } from 'node:child_process';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const has = (...names) => names.every((name) => (process.env[name] ?? '').trim());
const services = {
  Supabase: has('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'),
  Resend: has('RESEND_API_KEY', 'EMAIL_FROM', 'ADMIN_EMAILS'),
  Stripe: has('STRIPE_SECRET_KEY'),
  Discord: has('DISCORD_BOT_TOKEN'),
  Google: has('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET') && process.env.E2E_GOOGLE === '1',
};
const present = Object.entries(services).filter(([, ok]) => ok).map(([name]) => name);
const absent = Object.entries(services).filter(([, ok]) => !ok).map(([name]) => name);

if (!present.length) {
  console.log('Tests d’intégration non lancés : aucune clé de service dans .env.local.');
  console.log('Renseigne au moins Supabase (Project Settings → API), puis relance la commande.');
  process.exit(process.env.INTEGRATION_REQUIRED === '1' ? 1 : 0);
}
console.log(`Services testés pour de vrai : ${present.join(', ')}${absent.length ? ` · ignorés (clés absentes) : ${absent.join(', ')}` : ''}`);

const run = (command, args) => spawnSync(command, args, { stdio: 'inherit' }).status ?? 1;

const unit = run('npx', ['vitest', 'run', '--config', 'vitest.integration.config.ts']);
if (unit !== 0) process.exit(unit);
if (!services.Supabase) process.exit(0);
process.exit(run('npx', ['playwright', 'test', '--config', 'playwright.integration.config.ts', '--trace', 'off']));
