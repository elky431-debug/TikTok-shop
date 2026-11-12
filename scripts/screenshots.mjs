/**
 * Captures d'écran des pages principales, en mobile et en desktop (mode local uniquement).
 * Prérequis : l'appli tourne (npm run build && npm start, ou npm run dev).
 * Usage : node scripts/screenshots.mjs [--base http://localhost:3000] [--email moi@test.fr]
 *         [--out screenshots] [--pages /,/app,/app/studio] [--theme dark] [--only mobile]
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith('--')) acc.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);

const BASE = args.base ?? 'http://localhost:3000';
const EMAIL = args.email ?? 'captures@pepite.local';
const OUT = args.out ?? 'screenshots';
const PAGES = (args.pages ?? '/,/prix,/formateurs,/connexion,/app,/app/studio,/app/mes-produits,/app/recap,/app/parrainage,/app/compte').split(',');
const THEME = args.theme ?? 'light';
const VIEWPORTS = [
  { name: 'mobile', options: { ...devices['iPhone 13'] } },
  { name: 'desktop', options: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
].filter((v) => !args.only || v.name === args.only);

mkdirSync(OUT, { recursive: true });

async function login(page) {
  await page.goto(`${BASE}/connexion`);
  await page.fill('#email', EMAIL);
  await page.click('button[type=submit]');
  await page.click('[data-testid=lien-magique-local]');
  await page.waitForURL(/\/(app|bienvenue)/);
  if (page.url().includes('/bienvenue')) {
    await page.fill('#prenom', 'Léa');
    await page.fill('#pseudo', 'lea.teste');
    await page.click('button[type=submit]');
    await page.click('text=Entre 1 500 et 5 000');
    await page.click('button[type=submit]');
    await page.click('text=Beauté et soins');
    await page.click('text=Maison et cuisine');
    await page.click('button[type=submit]');
    await page.click('text=Face caméra');
    await page.fill('#phrase', 'Les filles, faut que je vous montre un truc.');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/app/);
  }
}

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ ...vp.options, colorScheme: THEME === 'dark' ? 'dark' : 'light', locale: 'fr-FR' });
  const page = await context.newPage();
  const needsLogin = PAGES.some((p) => p.startsWith('/app') || p.startsWith('/formateur') || p.startsWith('/admin'));
  if (needsLogin) await login(page);
  for (const path of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    const name = path === '/' ? 'accueil' : path.replace(/^\//, '').replace(/[/?=&]/g, '_');
    const file = `${OUT}/${name}-${vp.name}${THEME === 'dark' ? '-sombre' : ''}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log('✓', file);
  }
  await context.close();
}
await browser.close();
