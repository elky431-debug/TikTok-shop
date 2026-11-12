/**
 * Met en place un vrai projet Supabase : migrations, types TypeScript, puis seed.
 *
 * Usage : npm run db:setup                 (tout)
 *         npm run db:setup -- --sans-types  (sans régénérer lib/db/database.types.ts)
 *         npm run db:setup -- --sans-seed   (sans remplir le catalogue)
 *
 * Variables (lues dans l'environnement ou .env.local, jamais affichées) :
 *   SUPABASE_DB_URL        chaîne de connexion Postgres du projet (Dashboard → Connect → « Session pooler »)
 *   SUPABASE_ACCESS_TOKEN  facultatif : jeton personnel, pour générer les types par l'API de gestion
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY : pour le seed
 *
 * Les migrations sont écrites pour être rejouables (« if not exists », « create or replace »,
 * « drop policy if exists ») : les appliquer deux fois ne casse rien.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const CLI = 'supabase@3';
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

function applyMigrations(dbUrl: string) {
  step('Migrations');
  const dir = path.join('supabase', 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
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
  const header =
    '// Généré par « npm run db:setup » (supabase gen types) à partir du projet Supabase.\n' +
    '// Ne pas modifier à la main : relancer la commande après chaque migration.\n\n';
  writeFileSync(path.join('lib', 'db', 'database.types.ts'), header + result.stdout);
  console.log('  ✓ types régénérés');
}

function seed() {
  step('Seed (npm run seed)');
  const result = spawnSync('npm', ['run', 'seed', '--silent'], { stdio: 'inherit' });
  if (result.status !== 0) fail('le seed a échoué.');
}

function main() {
  const dbUrl = read('SUPABASE_DB_URL');
  const missing = ['SUPABASE_DB_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
    (name) => !read(name),
  );
  if (missing.length) {
    fail(
      `variables manquantes : ${missing.join(', ')}.\n` +
        '  SUPABASE_DB_URL : Supabase → Connect → « Session pooler » (avec le mot de passe de la base).\n' +
        '  Les trois autres : Supabase → Project Settings → API.',
    );
  }
  // Vérification légère : le fichier de migrations initial doit être là.
  readFileSync(path.join('supabase', 'migrations', '20261112000100_schema.sql'));

  applyMigrations(dbUrl);
  if (!args.has('--sans-types')) generateTypes(dbUrl);
  if (!args.has('--sans-seed')) seed();
  console.log('\n✓ Supabase prêt. Lance « npm run test:integration » pour tout vérifier contre la vraie base.');
}

main();
