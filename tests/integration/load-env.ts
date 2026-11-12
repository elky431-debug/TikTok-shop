import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Variables de .env.local pour les tests d'intégration. @next/env ne charge jamais .env.local quand
 * NODE_ENV=test (cas de Vitest), d'où cette lecture directe. Une variable déjà définie dans l'environnement
 * l'emporte sur le fichier (CI, surcharge ponctuelle). Les valeurs ne sont jamais affichées.
 */
export function integrationEnv(cwd = process.cwd()): Record<string, string> {
  const file = path.join(cwd, '.env.local');
  const fromFile = existsSync(file) ? (parseEnv(readFileSync(file, 'utf8')) as Record<string, string>) : {};
  const merged: Record<string, string> = { ...fromFile };
  for (const key of Object.keys(fromFile)) {
    const current = process.env[key];
    if (current !== undefined && current !== '') merged[key] = current;
  }
  return merged;
}
