/**
 * Captures du défilé de l'accueil : `npm run screenshots:landing`.
 *
 * 1. Lit le catalogue réel de la veille dans Supabase (clés de .env.local, en lecture seule) et le copie, avec le nom
 *    court de chaque produit, dans une base locale dédiée (`.data/landing-db.json`). Sans clés Supabase, le catalogue
 *    fictif sert à la place (signalé « démonstration » dans l'appli).
 * 2. Remplit un compte de démo avec les vraies fonctions de l'appli : produits suivis, plan de publication, gains
 *    modestes, objectif, alertes, favoris, scripts, série de 20, analyse de vidéo, proposition de marque (IA réelle si
 *    une clé d'IA est dans .env.local, sinon générateur simulé).
 * 3. Lance l'appli en local sur cette base, capture chaque page avec Playwright, puis écrit des WebP de 640 et 320 px
 *    dans `public/landing/`.
 *
 * Capture fournie à la main : une image `docs/landing/<slug>.png` (ou .jpg, .jpeg, .webp) remplace la capture
 * automatique de cette carte (recadrée par le haut au format des cartes, puis convertie en WebP aux deux tailles).
 * C'est le cas de l'analyse de vidéo (`docs/landing/analyse.png`). `npm run screenshots:landing -- --sources` convertit
 * seulement ces images, sans rien recapturer.
 *
 * Rien n'est écrit dans Supabase : l'étape 2 tourne en mode local (base JSON).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DB_FILE = path.join(ROOT, '.data', 'landing-db.json');
const CATALOG_FILE = path.join(ROOT, '.data', 'landing-catalog.json');
const OUT = path.join(ROOT, 'public', 'landing');
/** Captures fournies à la main (prioritaires sur la capture automatique). */
const SOURCES = path.join(ROOT, 'docs', 'landing');
const PORT = Number(process.env.LANDING_PORT ?? 3320);
const BASE = `http://localhost:${PORT}`;
const EMAIL = 'demo-accueil@tracktout.local';
/** Fenêtre de capture (rapport des cartes du défilé : 320 × 208). */
const VIEWPORT = { width: 1100, height: 715 };

export const LANDING_SHOTS = [
  'dashboard',
  'radar',
  'fiche-produit',
  'studio',
  'serie',
  'teleprompteur',
  'plan',
  'recap',
  'propositions',
  'analyse',
  'alertes',
  'comparateur',
] as const;

/** Nom court d'un produit : sans crochets ni parenthèses, avant le premier séparateur, 5 mots au plus. */
export function shortName(name: string): string {
  let s = name.replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, ' ');
  s = s.split(/\s[|–—-]\s|\||,|:/)[0] ?? s;
  s = s.replace(/\s+/g, ' ').trim();
  const words = s.split(' ');
  if (words.length > 5) s = words.slice(0, 5).join(' ');
  if (s.length > 36) s = s.slice(0, 36).replace(/\s+\S*$/, '');
  if (s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
  return s.length >= 3 ? s : name.slice(0, 32);
}

// ---------------------------------------------------------------------------------------------------------------------
// Étape 1 (processus à part, clés Supabase) : export du catalogue de la veille
// ---------------------------------------------------------------------------------------------------------------------

async function exportCatalog() {
  const { loadEnvConfig } = await import('@next/env');
  loadEnvConfig(ROOT);
  const { getRepo } = await import('@/lib/db');
  const { getLiveCatalog } = await import('@/lib/catalog');
  const repo = getRepo();
  if (repo.kind !== 'supabase') {
    writeFileSync(CATALOG_FILE, JSON.stringify({ products: [], snapshots: [] }));
    console.log('  Supabase non configuré : catalogue fictif à la place.');
    return;
  }
  const catalog = await getLiveCatalog(repo);
  const products = [...catalog.products].sort((a, b) => b.latest_score - a.latest_score).slice(0, 60);
  const snapshots = [];
  for (const p of products.slice(0, 16)) snapshots.push(...(await repo.getProductSnapshots(p.id, 30)));
  writeFileSync(CATALOG_FILE, JSON.stringify({ dataDate: catalog.dataDate, products, snapshots }));
  console.log(`  ${products.length} produits du ${catalog.dataDate}, ${snapshots.length} relevés.`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Étape 2 (mode local forcé) : base de démo
// ---------------------------------------------------------------------------------------------------------------------

/** Variables du mode local : jamais Supabase, jamais de source payante. L'IA reste celle de .env.local si elle existe. */
function localEnv(withAi: boolean): NodeJS.ProcessEnv {
  const file = path.join(ROOT, '.env.local');
  const ai: Record<string, string> = {};
  if (withAi && existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^(AI_PROVIDER|OPENAI_API_KEY|OPENAI_MODEL|OPENAI_REASONING_EFFORT|ANTHROPIC_API_KEY|ANTHROPIC_MODEL)=(.*)$/);
      if (m) ai[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    LOCAL_DB_PATH: DB_FILE,
    NEXT_PUBLIC_SITE_URL: BASE,
    DATA_PROVIDER: 'mock',
    NEXSCOPE_API_KEY: '',
    STRIPE_SECRET_KEY: '',
    RESEND_API_KEY: '',
    CRON_SECRET: '',
    NEXT_TELEMETRY_DISABLED: '1',
    AI_PROVIDER: ai.AI_PROVIDER ?? '',
    OPENAI_API_KEY: ai.OPENAI_API_KEY ?? '',
    OPENAI_MODEL: ai.OPENAI_MODEL ?? '',
    OPENAI_REASONING_EFFORT: ai.OPENAI_REASONING_EFFORT ?? '',
    ANTHROPIC_API_KEY: ai.ANTHROPIC_API_KEY ?? '',
    ANTHROPIC_MODEL: ai.ANTHROPIC_MODEL ?? '',
  };
}

const videoText = (product: string) => `Attendez, il faut que je vous montre ce que j'ai reçu : ${product}. Regardez la différence, avant, après.
Je l'utilise tous les jours depuis une semaine, c'est simple, rapide, et franchement le prix est raisonnable. Le lien est dans
mon panier si vous voulez le tester. Dites-moi en commentaire si vous voulez la suite ! #publicité`;

const OFFER_TEXT = `Bonjour ! Je m'occupe des partenariats d'une jeune marque de soins pour le visage vendue sur TikTok Shop. On aime beaucoup
ton contenu beauté. On te propose un échantillon gratuit de notre sérum éclat et 15 % de commission sur chaque vente faite avec
ton lien, pendant 3 mois, pour 2 vidéos par mois. Est-ce que ça t'intéresserait ? Bonne journée, l'équipe partenariats.`;

async function buildDemo(): Promise<{ docId: string; seriesId: string; analysisId: string; offerId: string; productId: string; compare: string[] }> {
  Object.assign(process.env, localEnv(true));
  rmSync(DB_FILE, { force: true });
  const { getRepo } = await import('@/lib/db');
  const { ensureCatalog } = await import('@/lib/jobs/nightly');
  const { getLiveCatalog } = await import('@/lib/catalog');
  const { addDays, parisDate } = await import('@/lib/utils');
  const { ensureBoard, saveBoard, setWeeklyGoal } = await import('@/lib/v2/board');
  const { buildPlan } = await import('@/lib/v2/planning');
  const { setEarningsGoal } = await import('@/lib/v2/earnings-store');
  const { createAlert } = await import('@/lib/radar/alerts');
  const { parseFilters } = await import('@/lib/radar-filters');
  const { FAVORITES_KIND } = await import('@/lib/radar/settings');
  const { notify } = await import('@/lib/notify');
  const { DEFAULT_SETTINGS } = await import('@/lib/ai/formats');
  const { TASK_HANDLERS } = await import('@/lib/tasks/handlers');
  const repo = getRepo();
  if (repo.kind !== 'local') throw new Error('Étape 2 hors du mode local : arrêt, rien n’est écrit.');

  // Catalogue : produits réels de la veille (nom court), sinon fictifs.
  const exported = existsSync(CATALOG_FILE) ? JSON.parse(readFileSync(CATALOG_FILE, 'utf8')) : { products: [], snapshots: [] };
  if (exported.products.length) {
    await repo.upsertProducts(exported.products.map((p: { name: string }) => ({ ...p, name: shortName(p.name) })));
    await repo.upsertSnapshots(exported.snapshots);
  } else {
    await ensureCatalog(repo);
  }
  // Une tâche de nuit enregistrée aujourd'hui : l'appli ne relance pas de relevé pendant les captures.
  const run = await repo.startCronRun('nightly', 'manuel');
  await repo.finishCronRun(run.id, 'ok', { note: 'captures de l’accueil' });

  const today = parisDate();
  const { products } = await getLiveCatalog(repo);
  const ranked = [...products].sort((a, b) => b.latest_score - a.latest_score);
  const present = [...new Set(ranked.map((p) => p.niche))];
  const niches = [...new Set([...(present.includes('beaute') ? ['beaute' as const] : []), ...present])].slice(0, 2);
  const picks = [...ranked.filter((p) => p.niche === niches[0]).slice(0, 3), ...ranked.filter((p) => p.niche === niches[1]).slice(0, 2)];
  if (picks.length < 4) throw new Error('Pas assez de produits pour le compte de démo.');

  // Compte de démo, onboarding fait, Elite (toutes les pages ouvertes).
  const id = randomUUID();
  await repo.ensureProfile({ id, email: EMAIL });
  await repo.updateProfile(id, {
    first_name: 'Léa',
    tiktok_handle: 'lea.demo',
    follower_range: '5000-20000',
    affiliate_status: 'oui',
    experience_level: 'quelques_ventes',
    videos_per_week: '4-7',
    niches,
    video_styles: ['face_camera', 'mains'],
    video_style: 'face_camera',
    plan: 'elite',
    onboarding_version: 2,
    onboarded_at: new Date(Date.now() - 24 * 86_400_000).toISOString(),
  });
  let profile = (await repo.getProfile(id))!;

  // Produits suivis, tableaux de 20 vidéos, plan de publication en cours.
  for (const p of picks.slice(0, 4)) await repo.saveProduct(id, p.id);
  const [main, second, third] = picks;
  const mainRow = (await repo.getSavedProduct(id, main.id))!;
  const mainBoard = await ensureBoard(repo, id, mainRow, main);
  const plan = buildPlan({ productId: main.id, productName: main.name, rhythm: 5, start: addDays(today, -10) });
  plan.items = plan.items.map((item) =>
    item.date && item.date < today ? { ...item, status: 'poste', posted_at: item.date, views: 800 + item.n * 137, sales: item.n % 3 === 0 ? 1 : 0 } : item,
  );
  await saveBoard(repo, id, mainBoard, plan);
  const secondRow = (await repo.getSavedProduct(id, second.id))!;
  const secondBoard = await ensureBoard(repo, id, secondRow, second);
  await saveBoard(repo, id, secondBoard, {
    ...secondBoard.data,
    items: secondBoard.data.items.map((i) => (i.n <= 3 ? { ...i, status: 'poste', posted_at: addDays(today, -i.n * 2) } : i.n === 4 ? { ...i, status: 'tourne' } : i)),
  });
  await setWeeklyGoal(repo, id, 5);

  // Gains modestes, saisis à la main (quelques euros par jour de vente) ; objectif du mois.
  const amounts = [420, 0, 760, 310, 0, 590, 240, 0, 880, 350, 0, 470, 0, 660, 290, 0, 510, 380, 0, 720];
  for (let d = 0; d < amounts.length; d++) {
    if (!amounts[d]) continue;
    const prod = d % 3 === 0 ? second : main;
    await repo.saveRecord(id, 'gain', {
      date: addDays(today, -d - 1),
      product_name: prod.name,
      product_id: prod.id,
      video: null,
      amount_cents: amounts[d],
      sales: Math.max(1, Math.round(amounts[d] / 400)),
      source: 'saisie',
    });
  }
  await setEarningsGoal(repo, id, 15_000);

  // Alertes, notification d'alerte, favoris pour le comparateur.
  await createAlert(profile, { name: `${niches[0] === 'beaute' ? 'Beauté' : 'Ma niche'} qui monte`, criteria: parseFilters({ niche: niches[0], tendance: 'monte' }), channels: { push: true, email: false, discord: false } }, repo);
  await createAlert(profile, { name: 'Bonne commission', criteria: parseFilters({ commission: '15' }), channels: { push: true, email: true, discord: false } }, repo);
  await notify(id, { type: 'alerte', title: `2 nouveaux produits pour « ${niches[0] === 'beaute' ? 'Beauté' : 'Ma niche'} qui monte »`, body: 'Ouvre le radar pour les voir.', path: '/app/radar' }, repo);
  const compare = [main.id, second.id, third.id];
  await repo.saveRecord(id, FAVORITES_KIND, { ids: compare });

  // Contenus écrits par l'IA (réelle si une clé est là) : scripts, série, analyse, proposition.
  profile = (await repo.getProfile(id))!;
  const idOf = (p: string, re: RegExp) => {
    const m = p.match(re);
    if (!m) throw new Error(`Génération impossible : ${p}`);
    return m[1];
  };
  console.log('  Écriture des contenus (IA)…');
  const docId = idOf(await TASK_HANDLERS.studio(profile, { produit: main.id, format: 'demo', reglages: DEFAULT_SETTINGS, brouillon: null }, repo), /\/app\/studio\/([\w-]+)$/);
  const seriesId = idOf(await TASK_HANDLERS.serie(profile, { produit: main.id }, repo), /\/app\/studio\/serie\/([\w-]+)$/);
  const analysisId = idOf(await TASK_HANDLERS.analyse(profile, { lien: '', texte: videoText(main.name.toLowerCase()), video: null, produit: main.id }, repo), /analyse=([\w-]+)/);
  const offerId = idOf(await TASK_HANDLERS.offre(profile, { message: OFFER_TEXT }, repo), /offre=([\w-]+)/);
  return { docId, seriesId, analysisId, offerId, productId: main.id, compare };
}

// ---------------------------------------------------------------------------------------------------------------------
// Étape 3 : appli locale, captures, WebP
// ---------------------------------------------------------------------------------------------------------------------

function startServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['next', 'dev', '-p', String(PORT)], { env: localEnv(false), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const timer = setTimeout(() => reject(new Error('Le serveur local n’a pas démarré.')), 120_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (/Ready in/.test(chunk.toString())) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('exit', (code) => reject(new Error(`Serveur arrêté (${code}).`)));
  });
}

/** Image fournie à la main pour cette carte, s'il y en a une. */
function customSource(slug: string): string | null {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const file = path.join(SOURCES, `${slug}.${ext}`);
    if (existsSync(file)) return file;
  }
  return null;
}

/** WebP des deux tailles des cartes (640 × 416 pour les écrans à haute densité, 320 × 208), recadrés par le haut. */
async function writeCard(slug: string, input: Buffer | string) {
  const sharp = (await import('sharp')).default;
  mkdirSync(OUT, { recursive: true });
  await sharp(input).resize(640, 416, { fit: 'cover', position: 'top' }).webp({ quality: 74 }).toFile(path.join(OUT, `${slug}.webp`));
  await sharp(input).resize(320, 208, { fit: 'cover', position: 'top' }).webp({ quality: 74 }).toFile(path.join(OUT, `${slug}-320.webp`));
}

/** Convertit seulement les captures fournies à la main. */
async function convertSources(): Promise<number> {
  let count = 0;
  for (const slug of LANDING_SHOTS) {
    const file = customSource(slug);
    if (!file) continue;
    await writeCard(slug, file);
    console.log(`  ✓ ${slug} (capture fournie : ${path.relative(ROOT, file)})`);
    count++;
  }
  return count;
}

async function capture(ids: Awaited<ReturnType<typeof buildDemo>>) {
  const { chromium } = await import('playwright');
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, locale: 'fr-FR', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${BASE}/connexion`);
  await page.getByRole('button', { name: /Reçois un lien de connexion/ }).click();
  await page.getByLabel('Ton adresse e-mail').fill(EMAIL);
  await page.getByRole('button', { name: 'Recevoir mon lien magique' }).click();
  await page.getByTestId('lien-magique-local').click();
  await page.waitForURL(/\/app/, { timeout: 120_000 });

  const pages: Record<(typeof LANDING_SHOTS)[number], string> = {
    dashboard: '/app',
    radar: '/app/radar',
    'fiche-produit': `/app/produit/${encodeURIComponent(ids.productId)}`,
    studio: `/app/studio/${ids.docId}`,
    serie: `/app/studio/serie/${ids.seriesId}`,
    teleprompteur: `/app/studio/${ids.docId}`,
    plan: '/app/plan',
    recap: '/app/recap',
    propositions: `/app/offres?offre=${ids.offerId}`,
    analyse: `/app/analyse?analyse=${ids.analysisId}`,
    alertes: '/app/alertes',
    comparateur: `/app/comparer?ids=${ids.compare.map(encodeURIComponent).join(',')}`,
  };
  for (const slug of LANDING_SHOTS) {
    const source = customSource(slug);
    if (source) {
      await writeCard(slug, source);
      console.log(`  ✓ ${slug} (capture fournie : ${path.relative(ROOT, source)})`);
      continue;
    }
    await page.goto(`${BASE}${pages[slug]}`, { waitUntil: 'networkidle', timeout: 120_000 });
    if (slug === 'teleprompteur') {
      await page.getByRole('button', { name: 'Téléprompteur' }).first().click();
      await page.getByRole('dialog').waitFor();
    }
    // Pages dont le résultat est sous un formulaire : on descend jusqu'à lui (un peu d'air au-dessus).
    const anchor: Partial<Record<(typeof LANDING_SHOTS)[number], [string, number]>> = {
      radar: ['N°1 dans tes niches aujourd’hui', 90],
      plan: ['Lun.', 150],
      propositions: ['Ce que dit la proposition', 90],
      analyse: ['Découpage', 90],
    };
    const spot = anchor[slug];
    if (spot) {
      const target = page.getByText(spot[0], { exact: true }).first();
      await target.scrollIntoViewIfNeeded();
      await page.evaluate((y) => window.scrollBy(0, y), await target.evaluate((el, gap) => el.getBoundingClientRect().top - gap, spot[1]));
    }
    await page.waitForTimeout(1500);
    await writeCard(slug, await page.screenshot());
    console.log(`  ✓ ${slug}`);
  }
  await browser.close();
}

async function main() {
  if (process.argv.includes('--exporter')) return exportCatalog();
  if (process.argv.includes('--sources')) {
    const count = await convertSources();
    console.log(count ? `${count} capture(s) fournie(s) convertie(s) dans ${path.relative(ROOT, OUT)}/` : `Aucune image dans ${path.relative(ROOT, SOURCES)}/.`);
    return;
  }
  mkdirSync(path.dirname(DB_FILE), { recursive: true });
  console.log('1/3 Catalogue de la veille (Supabase, lecture seule)');
  const exported = spawnSync('npx', ['tsx', 'scripts/screenshots-landing.ts', '--exporter'], { stdio: 'inherit', env: process.env });
  if (exported.status !== 0) throw new Error('Export du catalogue impossible.');
  console.log('2/3 Compte de démo (base locale)');
  const ids = await buildDemo();
  console.log('3/3 Captures');
  const server = await startServer();
  try {
    await capture(ids);
  } finally {
    if (server.pid) process.kill(-server.pid);
  }
  console.log(`Images dans ${path.relative(ROOT, OUT)}/`);
}

main().catch((error) => {
  console.error('✗', error instanceof Error ? error.message : error);
  process.exit(1);
});
