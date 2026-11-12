import { defineConfig, devices } from '@playwright/test';

/**
 * Trois parcours clés, en mode local (aucune clé) : inscription, écriture de scripts, paiement.
 * Le serveur est construit puis lancé sur une base dédiée (.data/e2e-db.json), remise à zéro à chaque run.
 * Paiement Stripe réel en mode test : voir tests/e2e/paiement.spec.ts (E2E_STRIPE=1).
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      LOCAL_DB_PATH: '.data/e2e-db.json',
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
