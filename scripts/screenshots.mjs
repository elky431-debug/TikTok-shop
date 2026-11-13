/**
 * Captures d'écran des pages principales, en mobile et en desktop (mode local uniquement).
 * Prérequis : l'appli tourne (npm run build && npm start, ou npm run dev).
 *
 * Usage : node scripts/screenshots.mjs [--base http://localhost:3000] [--email moi@test.fr]
 *         [--out screenshots] [--pages /,/app,@dernier-script] [--theme light] [--only mobile]
 *         [--format jpeg] [--scale 2] [--pro] [--suffix pro]
 *
 * --pro : passe le compte en Pro (paiement simulé) avant les captures.
 * @dernier-script : ouvre le dernier script écrit (en écrit un si besoin).
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
const EMAIL = args.email ?? 'captures@tracktout.local';
const OUT = args.out ?? 'screenshots';
const PAGES = (args.pages ?? '/,/prix,/formateurs,/connexion,/app,/app/studio,/app/mes-produits,/app/recap,/app/parrainage,/app/compte').split(',');
// Le noir est le thème par défaut ; --theme light pose le cookie du thème clair (option du compte).
const THEME = args.theme === 'light' ? 'light' : 'dark';
const FORMAT = args.format === 'jpeg' ? 'jpeg' : 'png';
const SUFFIX = args.suffix ? `-${args.suffix}` : '';
const SCALE = args.scale ? Number(args.scale) : undefined;
const VIEWPORTS = [
  { name: 'mobile', options: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, ...(SCALE ? { deviceScaleFactor: SCALE } : {}) } },
  { name: 'desktop', options: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
].filter((v) => !args.only || v.name === args.only);

mkdirSync(OUT, { recursive: true });

async function login(page) {
  // Mode local : lien magique affiché à l'écran.
  await page.goto(`${BASE}/connexion`);
  await page.getByRole('button', { name: /Reçois un lien de connexion/ }).click();
  await page.getByLabel('Ton adresse e-mail').fill(EMAIL);
  await page.getByRole('button', { name: 'Recevoir mon lien magique' }).click();
  await page.click('[data-testid=lien-magique-local]');
  await page.waitForURL(/\/(app|admin|formateur|bienvenue)/);
  if (page.url().includes('/bienvenue')) {
    // Onboarding en 10 questions (les facultatives passées).
    if (await page.getByLabel('Ton prénom').isVisible()) {
      await page.getByLabel('Ton prénom').fill('Léa');
      await page.getByRole('button', { name: 'Continuer' }).click();
      await page.getByRole('button', { name: 'Passer' }).click();
    }
    await page.getByRole('radio', { name: 'Entre 5 000 et 20 000' }).click();
    await page.getByRole('radio', { name: 'Oui' }).click();
    await page.getByRole('radio', { name: /quelques ventes/i }).click();
    if (await page.getByRole('checkbox', { name: 'Beauté' }).isVisible()) {
      await page.getByRole('checkbox', { name: 'Beauté' }).click();
      await page.getByRole('checkbox', { name: 'Maison' }).click();
      await page.getByRole('button', { name: 'Continuer' }).click();
    }
    await page.getByRole('radio', { name: /4 à 7 vidéos/ }).click();
    await page.getByRole('checkbox', { name: /Face caméra/ }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('radio', { name: '500 €' }).click();
    if (await page.getByRole('button', { name: 'Passer' }).isVisible()) await page.getByRole('button', { name: 'Passer' }).click();
    await page.waitForURL(/\/app/, { timeout: 30_000 });
  }
}

async function upgrade(page) {
  await page.goto(`${BASE}/app/compte`);
  if (await page.isVisible('text=Gérer mon abonnement')) return;
  await page.goto(`${BASE}/app/paiement-simule?plan=pro&periode=month`);
  await page.click('button:has-text("Simuler le paiement")');
  await page.waitForURL(/paiement=ok/);
}

async function openLastScript(page) {
  await page.goto(`${BASE}/app/studio`);
  const last = page.locator('a[href^="/app/studio/"]').first();
  if (await last.count()) {
    await last.click();
  } else {
    await page.click('button:has-text("Écrire mes scripts")');
  }
  await page.waitForURL(/\/app\/studio\/[0-9a-f-]{36}/);
  await page.waitForSelector('main h1');
}

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ ...vp.options, colorScheme: 'dark', locale: 'fr-FR' });
  if (THEME === 'light') {
    await context.addCookies([{ name: 'tracktout_theme', value: 'light', url: BASE }]);
  }
  const page = await context.newPage();
  const needsLogin = PAGES.some((p) => p.startsWith('/app') || p.startsWith('/formateur') || p.startsWith('/admin') || p.startsWith('@'));
  if (needsLogin) await login(page);
  if (args.pro) await upgrade(page);
  for (const path of PAGES) {
    let name;
    if (path === '@dernier-script') {
      await openLastScript(page);
      name = 'studio-resultat';
    } else {
      await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
      await page.waitForSelector('h1');
      name = path === '/' ? 'accueil' : path === '/app' ? 'dashboard' : path.replace(/^\//, '').replace(/^app\//, '').replace(/[/?=&]/g, '_');
    }
    // Les sections apparaissent au défilement : on parcourt la page avant la capture.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 300) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
      }
      window.scrollTo(0, 0);
    });
    // En pleine page, les barres fixes apparaîtraient au milieu : on les remet dans le flux.
    await page.addStyleTag({ content: 'header.sticky, header.fixed, nav.fixed { position: static !important; }' });
    // Sur téléphone, la barre du bas de l'appli resterait au milieu d'une capture pleine page : on la cache.
    if (vp.name === 'mobile') await page.addStyleTag({ content: 'nav[aria-label="Raccourcis"] { display: none !important; }' });
    await page.waitForTimeout(path === '/' ? 3500 : 700);
    const file = `${OUT}/${name}-${vp.name}${THEME === 'light' ? '-clair' : ''}${SUFFIX}.${FORMAT === 'jpeg' ? 'jpg' : 'png'}`;
    await page.screenshot({ path: file, fullPage: true, type: FORMAT, ...(FORMAT === 'jpeg' ? { quality: 72 } : {}) });
    console.log('✓', file);
  }
  await context.close();
}
await browser.close();
