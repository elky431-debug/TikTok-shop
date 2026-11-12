import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'vitest/config';

// Les tests d'intégration utilisent les vraies clés (.env.local ou environnement), jamais affichées.
loadEnvConfig(process.cwd());

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
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
