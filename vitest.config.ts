import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Le tsconfig garde le JSX « preserve » pour Next ; Vitest doit, lui, le transformer.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    env: {
      // Les tests tournent toujours en mode local, sans aucune clé.
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      ANTHROPIC_API_KEY: '',
      AI_PROVIDER: '',
      OPENAI_API_KEY: '',
      DATA_PROVIDER: '',
      NEXSCOPE_API_KEY: '',
      CRON_SECRET: '',
      STRIPE_SECRET_KEY: '',
      RESEND_API_KEY: '',
      LOCAL_DB_PATH: '.data/test-db.json',
    },
  },
});
