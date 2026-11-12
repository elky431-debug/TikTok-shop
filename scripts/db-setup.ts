/**
 * Met en place un vrai projet Supabase : migrations, types TypeScript, puis seed.
 *
 * Usage : npm run db:setup                 (tout)
 *         npm run db:setup -- --sans-types  (sans régénérer lib/db/database.types.ts)
 *         npm run db:setup -- --sans-seed   (sans remplir le catalogue)
 *
 * Deux voies, au choix (variables lues dans l'environnement ou .env.local, jamais affichées) :
 *   - SUPABASE_ACCESS_TOKEN (jeton personnel, supabase.com → Account → Access Tokens) : tout passe par l'API de
 *     gestion de Supabase en HTTPS (POST /v1/projects/{ref}/database/migrations, GET …/types/typescript). Marche
 *     même là où le port 5432 de Postgres est fermé. Chaque migration est enregistrée sous son nom de fichier :
 *     relancer la commande n'applique que les nouvelles.
 *   - SUPABASE_DB_URL (Dashboard → Connect → « Session pooler ») : psql, sinon la CLI Supabase.
 *   NEXT_PUBLIC_SUPABASE_URL (référence du projet), NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY : seed.
 *
 * Les migrations sont écrites pour être rejouables (« if not exists », « create or replace »,
 * « drop policy if exists ») : les appliquer deux fois ne casse rien.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const CLI = 'supabase@3';
const MANAGEMENT_API = 'https://api.supabase.com/v1';
const args = new Set(process.argv.slice(2));
const read = (name: string) => (process.env[name] ?? '').trim();

function step(title: string) {
  console.log(`\n→ ${title}`);
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function hasCommand(command: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' }).status === 0;
}

/** Variables libpq tirées de l'URL : le mot de passe ne passe jamais en argument de commande. */
function pgEnv(dbUrl: string): NodeJS.ProcessEnv {
  let url: URL;
  try {
    url = new URL(dbUrl);
  } catch {
    fail('SUPABASE_DB_URL n’est pas une URL postgres:// valide.');
  }
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, '') || 'postgres',
    PGSSLMODE: url.searchParams.get('sslmode') ?? 'require',
    PGOPTIONS: '-c client_min_messages=warning',
  };
}

/** Référence du projet, tirée de https://<ref>.supabase.co */
function projectRef(): string | null {
  const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co/.exec(read('NEXT_PUBLIC_SUPABASE_URL'));
  return match ? match[1] : null;
}

const MIGRATIONS_DIR = path.join('supabase', 'migrations');
const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

/** Appel à l'API de gestion ; le jeton n'apparaît jamais dans les messages. */
async function managementApi(pathname: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${MANAGEMENT_API}${pathname}`, {
    ...init,
    headers: { authorization: `Bearer ${read('SUPABASE_ACCESS_TOKEN')}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    const hint = response.status === 401 || response.status === 403 ? ' (jeton refusé ou sans accès à ce projet)' : '';
    fail(`API de gestion Supabase : HTTP ${response.status}${hint} sur ${pathname.split('?')[0]} — ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function applyMigrationsViaApi(ref: string) {
  step('Migrations (API de gestion Supabase)');
  const applied = (await managementApi(`/projects/${ref}/database/migrations`)) as Array<{ version: string; name?: string }>;
  const names = new Set(applied.map((m) => m.name).filter(Boolean));
  for (const file of migrationFiles()) {
    const name = file.replace(/\.sql$/, '');
    if (names.has(name)) {
      console.log(`  = ${file} (déjà appliquée)`);
      continue;
    }
    const query = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const key = `tracktout-${name}-${createHash('sha256').update(query).digest('hex').slice(0, 16)}`;
    await managementApi(`/projects/${ref}/database/migrations`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify({ query, name }),
    });
    console.log(`  ✓ ${file}`);
  }
}

async function generateTypesViaApi(ref: string) {
  step('Types TypeScript (API de gestion Supabase)');
  const result = (await managementApi(`/projects/${ref}/types/typescript?included_schemas=public`)) as { types?: string };
  if (!result?.types?.includes('Database')) {
    console.warn('  ⚠ Réponse inattendue : les types écrits à la main restent en place.');
    return;
  }
  writeTypes(result.types);
}

function writeTypes(types: string) {
  const header =
    '// Généré par « npm run db:setup » (types du projet Supabase).\n' +
    '// Ne pas modifier à la main : relancer la commande après chaque migration.\n\n';
  writeFileSync(path.join('lib', 'db', 'database.types.ts'), header + types);
  console.log('  ✓ types régénérés');
}

function applyMigrations(dbUrl: string) {
  step('Migrations');
  const dir = MIGRATIONS_DIR;
  const files = migrationFiles();
  if (hasCommand('psql')) {
    const envForPsql = pgEnv(dbUrl);
    for (const file of files) {
      const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-f', path.join(dir, file)], {
        env: envForPsql,
        stdio: ['ignore', 'inherit', 'inherit'],
      });
      if (result.status !== 0) fail(`échec de la migration ${file} (voir le message de Postgres ci-dessus).`);
      console.log(`  ✓ ${file}`);
    }
    return;
  }
  // Sans psql : la CLI Supabase (téléchargée par npx) applique les migrations et tient l'historique.
  console.log('  psql introuvable : application avec la CLI Supabase.');
  const result = spawnSync('npx', ['--yes', CLI, 'db', 'push', `--remote=${dbUrl}`, '--include-all', '--yes'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (result.status !== 0) fail('la CLI Supabase n’a pas pu appliquer les migrations.');
}

function generateTypes(dbUrl: string) {
  step('Types TypeScript (lib/db/database.types.ts)');
  const ref = projectRef();
  const target = read('SUPABASE_ACCESS_TOKEN') && ref ? ref : dbUrl;
  const result = spawnSync('npx', ['--yes', CLI, 'gen', 'types', '--lang=typescript', '--schema', 'public', `--remote=${target}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout.includes('export type Database')) {
    console.warn(
      '  ⚠ Types non générés (la CLI a besoin de SUPABASE_ACCESS_TOKEN, ou de Docker avec une URL de base).\n' +
        '    Les types écrits à la main restent en place ; le reste de la mise en place continue.',
    );
    return;
  }
  writeTypes(result.stdout);
}

function seed() {
  step('Seed (npm run seed)');
  const result = spawnSync('npm', ['run', 'seed', '--silent'], { stdio: 'inherit' });
  if (result.status !== 0) fail('le seed a échoué.');
}

async function main() {
  const dbUrl = read('SUPABASE_DB_URL');
  const viaApi = Boolean(read('SUPABASE_ACCESS_TOKEN'));
  const ref = projectRef();
  const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter((name) => !read(name));
  if (!viaApi && !dbUrl) missing.unshift('SUPABASE_ACCESS_TOKEN ou SUPABASE_DB_URL');
  if (missing.length) {
    fail(
      `variables manquantes : ${missing.join(', ')}.\n` +
        '  SUPABASE_ACCESS_TOKEN : supabase.com → Account → Access Tokens (passe par HTTPS, conseillé).\n' +
        '  SUPABASE_DB_URL : Supabase → Connect → « Session pooler » (avec le mot de passe de la base).\n' +
        '  Les trois autres : Supabase → Project Settings → API.',
    );
  }
  if (viaApi && !ref) fail('NEXT_PUBLIC_SUPABASE_URL doit être de la forme https://<ref>.supabase.co pour utiliser l’API de gestion.');

  if (viaApi) await applyMigrationsViaApi(ref!);
  else applyMigrations(dbUrl);
  if (!args.has('--sans-types')) {
    if (viaApi) await generateTypesViaApi(ref!);
    else generateTypes(dbUrl);
  }
  if (!args.has('--sans-seed')) seed();
  console.log('\n✓ Supabase prêt. Lance « npm run test:integration » pour tout vérifier contre la vraie base.');
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
