/**
 * npm run test:integration : tests contre le vrai Supabase (Vitest), puis parcours de connexion (Playwright).
 * Sans clés Supabase, rien n'est lancé : le script dit lesquelles manquent et sort sans erreur,
 * sauf si INTEGRATION_REQUIRED=1 (utile en CI pour ne pas prendre un saut pour une réussite).
 */
import { spawnSync } from 'node:child_process';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((name) => !(process.env[name] ?? '').trim());

if (missing.length) {
  console.log(`Tests d’intégration non lancés : variables manquantes (${missing.join(', ')}).`);
  console.log('Renseigne-les dans .env.local (Supabase → Project Settings → API), puis relance la commande.');
  process.exit(process.env.INTEGRATION_REQUIRED === '1' ? 1 : 0);
}

const run = (command, args) => spawnSync(command, args, { stdio: 'inherit' }).status ?? 1;

const unit = run('npx', ['vitest', 'run', '--config', 'vitest.integration.config.ts']);
if (unit !== 0) process.exit(unit);
process.exit(run('npx', ['playwright', 'test', '--config', 'playwright.integration.config.ts', '--trace', 'off']));
