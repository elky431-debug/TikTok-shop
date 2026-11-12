import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { integrationEnv } from './tests/integration/load-env';

// Les tests d'intégration utilisent les vraies clés (.env.local ou environnement), jamais affichées.
// Variables de .env.local passées explicitement aux processus de test (voir tests/integration/load-env.ts).
const loadedEnv = integrationEnv();

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Une seule base partagée : on enchaîne les fichiers pour garder des tests lisibles.
    fileParallelism: false,
    env: loadedEnv,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
