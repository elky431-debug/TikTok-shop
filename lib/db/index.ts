import { env, isSupabaseConfigured } from '@/lib/env';
import { LocalRepo } from './local';
import type { Repo } from './repo';
import { SupabaseRepo } from './supabase';

export type { Repo } from './repo';
export * from './types';

let repo: Repo | null = null;
let localRepo: LocalRepo | null = null;

/** Base locale (fichier JSON) — uniquement en mode local. */
export function getLocalRepo(): LocalRepo {
  localRepo ??= new LocalRepo(env.localDbPath);
  return localRepo;
}

/** Point d'accès unique aux données : Supabase si configuré, sinon fichier local. */
export function getRepo(): Repo {
  if (repo) return repo;
  repo = isSupabaseConfigured() ? new SupabaseRepo() : getLocalRepo();
  return repo;
}

/** Pour les tests : injecte un dépôt. */
export function setRepoForTests(next: Repo | null): void {
  repo = next;
}
