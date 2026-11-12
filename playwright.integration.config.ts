import { defineConfig, devices } from '@playwright/test';
import { integrationEnv } from './tests/integration/load-env';

/**
 * Parcours de connexion contre le vrai Supabase (tests/integration/e2e). Lancé par « npm run test:integration »
 * seulement quand les clés Supabase sont présentes. Le serveur hérite des variables de l'environnement.
 */
// .env.local chargé pour les tests (clés Supabase) et pour le serveur lancé ci-dessous.
const loadedEnv = integrationEnv();
Object.assign(process.env, loadedEnv);

const PORT = Number(process.env.E2E_PORT ?? 3300);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/integration/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: BASE_URL, locale: 'fr-FR', timezoneId: 'Europe/Paris', trace: 'off' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
    // L'URL du site doit correspondre au serveur de test pour les redirections de connexion.
    env: { ...loadedEnv, NEXT_PUBLIC_SITE_URL: BASE_URL, NEXT_TELEMETRY_DISABLED: '1' },
  },
});
