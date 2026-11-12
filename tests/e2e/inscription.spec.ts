import { expect, test } from '@playwright/test';
import { completeOnboarding, signIn, uniqueEmail } from './helpers';

test('inscription : de l’accueil au radar, en mode préparation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sache quoi vendre sur TikTok Shop chaque matin.');
  await page.getByRole('link', { name: 'Démarrer gratuitement' }).first().click();
  await expect(page).toHaveURL(/\/connexion/);

  await signIn(page, uniqueEmail('inscription'));
  await expect(page).toHaveURL(/\/bienvenue/);

  // Écran 1 : prénom et pseudo
  await page.getByLabel('Ton prénom').fill('Inès');
  await page.getByLabel('Ton pseudo TikTok (facultatif)').fill('ines.teste');
  await page.getByRole('button', { name: 'Continuer' }).click();

  // Écran 2 : moins de 1 500 abonnés ⇒ le mode préparation est expliqué
  await page.getByText('Moins de 500', { exact: true }).click();
  await expect(page.getByText('Tu démarres en mode préparation')).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();

  // Écran 3 : au moins une niche est obligatoire
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Choisis au moins une niche.')).toBeVisible();
  await page.getByText('Beauté et soins', { exact: true }).click();
  await page.getByText('Animaux', { exact: true }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();

  // Écran 4 : style et phrase
  await page.getByText('Voix off', { exact: true }).click();
  await page.getByLabel('Une phrase que tu dirais dans une vidéo').fill('Les amis, regardez ça.');
  await page.getByRole('button', { name: 'Voir mes produits du jour' }).click();

  // Radar du plan gratuit
  await expect(page).toHaveURL(/\/app\?bienvenue=1/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Inès, voici tes produits du jour');
  await expect(page.getByText('Mode préparation', { exact: true })).toBeVisible();
  await expect(page.locator('a[href^="/app/produit/"]')).toHaveCount(3);
  await expect(page.getByText(/autres produits à vendre aujourd’hui/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Passer Pro' }).first()).toBeVisible();

  // Fiche produit accessible, score masqué
  await page.locator('a[href^="/app/produit/"]').first().click();
  await expect(page.getByRole('heading', { name: 'Pourquoi ce score' })).toBeVisible();
  await expect(page.getByText('Score Pro').first()).toBeVisible();
});

test('inscription avec un lien formateur : 3 mois de Pro offerts, sans carte', async ({ browser }) => {
  const code = `T${Date.now().toString(36).toUpperCase()}`;
  const coachEmail = uniqueEmail('formateur');

  // 1. Le futur formateur crée son compte.
  const coachContext = await browser.newContext();
  await signIn(await coachContext.newPage(), coachEmail);
  await coachContext.close();

  // 2. L'admin (admin@tracktout.local en mode local) le passe en formateur.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, 'admin@tracktout.local', '/admin');
  await expect(admin).toHaveURL(/\/admin/);
  const row = admin.locator('li', { has: admin.getByText(coachEmail) });
  await row.locator('summary').click();
  await row.getByLabel('Nom de la formation').fill('Formation E2E');
  await row.getByLabel('Code promo').fill(code);
  await row.getByRole('button', { name: 'Passer en formateur' }).click();
  await expect(admin.getByText('Compte passé en formateur.')).toBeVisible();
  await adminContext.close();

  // 3. Un élève arrive avec le lien du formateur.
  const studentContext = await browser.newContext();
  const page = await studentContext.newPage();
  await page.goto(`/r/${code}`);
  await expect(page.getByText(`Code formateur ${code} appliqué`)).toBeVisible();
  await signIn(page, uniqueEmail('eleve'));
  await completeOnboarding(page, { firstName: 'Nora' });
  await expect(page).toHaveURL(/bienvenue=essai/);
  await expect(page.getByText('Tes 3 mois de Pro sont activés')).toBeVisible();
  // Radar complet, score visible.
  await expect(page.getByText(/autres produits à vendre aujourd’hui/)).toHaveCount(0);
  await expect(page.getByLabel(/^Score \d+ sur 100$/).first()).toBeVisible();
  await studentContext.close();
});
