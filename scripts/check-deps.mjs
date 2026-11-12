/**
 * Vérifie, avant le build, que chaque paquet importé par le code est déclaré dans package.json et installé.
 * Sans cela, Next s'arrête sur « Module not found: Can't resolve '…' », sans dire quoi faire.
 * Usage : node scripts/check-deps.mjs (lancé tout seul par « npm run build »).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
const builtins = new Set(builtinModules);
const SOURCE_DIRS = ['app', 'lib', 'components', 'emails', 'config', 'scripts', 'netlify'];
const ROOT_FILES = ['middleware.ts', 'next.config.mjs', 'tailwind.config.ts'];
const EXT = /\.(ts|tsx|mjs|js)$/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

const files = [...SOURCE_DIRS.flatMap((d) => walk(path.join(root, d))), ...ROOT_FILES.map((f) => path.join(root, f)).filter(existsSync)];
const used = new Map();
const IMPORT = /(?:from\s+|import\s*\(\s*|require\(\s*)['"]([^'"./][^'"]*)['"]/g;
for (const file of files) {
  for (const [, spec] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
    if (spec.startsWith('@/') || spec.startsWith('node:')) continue;
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (builtins.has(name)) continue;
    if (!used.has(name)) used.set(name, path.relative(root, file));
  }
}

const undeclared = [...used].filter(([name]) => !declared.has(name));
const notInstalled = [...used].filter(([name]) => declared.has(name) && !existsSync(path.join(root, 'node_modules', name, 'package.json')));

if (undeclared.length) {
  console.error('✗ Paquets importés mais absents de package.json :');
  for (const [name, file] of undeclared) console.error(`  - ${name} (utilisé dans ${file})`);
  console.error('  Ajoute-les avec « npm install <paquet> », puis commite package.json et package-lock.json.');
}
if (notInstalled.length) {
  console.error('✗ Paquets déclarés mais pas installés :');
  for (const [name] of notInstalled) console.error(`  - ${name}`);
  console.error('  Lance « npm ci » à la racine du projet (Node 20.19 ou plus récent), puis relance le build.');
}
if (undeclared.length || notInstalled.length) process.exit(1);
console.log(`✓ Dépendances : ${used.size} paquets importés, tous déclarés et installés.`);
