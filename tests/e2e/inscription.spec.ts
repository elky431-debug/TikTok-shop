import { expect, test } from '@playwright/test';
import { completeOnboarding, signIn, signUpWithPassword, subscribe, uniqueEmail } from './helpers';

test('inscription : de l’accueil au radar, abonnement choisi avant l’appli, en mode préparation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Automatise ton business TikTok Shop de A à Z.');
  await page.getByRole('link', { name: 'Commencer', exact: true }).first().click();
  await expect(page).toHaveURL(/\/connexion/);

  // Inscription par e-mail et mot de passe : aucun e-mail n'est nécessaire.
  await signUpWithPassword(page, uniqueEmail('inscription'));
  await expect(page).toHaveURL(/\/bienvenue/);

  // Onboarding : une question par écran, retour possible, questions facultatives qu'on peut passer
  const start = Date.now();
  await expect(page.getByText('Question 1 sur 10')).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Indique ton prénom')).toBeVisible();
  await page.getByLabel('Ton prénom').fill('Inès');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Ton pseudo TikTok').fill('ines.teste');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: 'Moins de 1 000' }).click();
  // Moins de 1 500 abonnés ou « pas encore » ⇒ le mode préparation est expliqué
  await page.getByRole('radio', { name: 'Pas encore' }).click();
  await expect(page.getByText('Tu démarres en mode préparation.')).toBeVisible();
  await page.getByRole('button', { name: 'Retour' }).click();
  await expect(page.getByRole('radio', { name: 'Moins de 1 000' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: /Je débute/ }).click();
  // Niches : au moins une, trois au plus (les autres se grisent)
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Choisis au moins une niche.')).toBeVisible();
  for (const niche of ['Beauté', 'Animaux', 'Maison']) await page.getByRole('checkbox', { name: niche }).click();
  await expect(page.getByRole('checkbox', { name: 'Mode' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: /1 à 3 vidéos/ }).click();
  await page.getByRole('checkbox', { name: /Voix off/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Passer' }).click(); // objectif
  await page.getByRole('button', { name: 'Passer' }).click(); // code formateur
  await expect(page.getByText('On prépare')).toBeVisible();
  await expect(page).toHaveURL(/\/abonnement\?bienvenue=1/, { timeout: 30_000 });
  expect(Date.now() - start).toBeLessThan(120_000);

  // Choix de l'abonnement, obligatoire : l'appli renvoie ici tant qu'il n'y en a pas.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inès, choisis ton abonnement');
  await expect(page.getByText('Recommandé')).toBeVisible();
  await page.goto('/app/radar');
  await expect(page).toHaveURL(/\/abonnement/);
  // Sans la case de démarrage immédiat, rien n'est lancé.
  await page.getByRole('button', { name: 'Choisir Pro' }).click();
  await expect(page.getByText('Coche cette case pour démarrer ton abonnement tout de suite.')).toBeVisible();
  await expect(page).toHaveURL(/\/abonnement/);
  await subscribe(page, 'Pro');

  // Dashboard, puis radar complet en mode préparation
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard de Inès');
  await expect(page.getByText('Ton abonnement Pro est actif')).toBeVisible();
  await page.getByRole('link', { name: 'Ouvrir le radar' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Inès, voici tes produits du jour');
  await expect(page.getByText('Mode préparation', { exact: true })).toBeVisible();
  await expect(page.getByText(/autres produits à vendre aujourd’hui/)).toHaveCount(0);
  expect(await page.locator('a[href^="/app/produit/"]').count()).toBeGreaterThan(3);
  await expect(page.getByLabel(/^Score \d+ sur 100$/).first()).toBeVisible();

  // Fiche produit avec le score détaillé
  await page.locator('a[href^="/app/produit/"]').first().click();
  await expect(page.getByRole('heading', { name: 'Pourquoi ce score' })).toBeVisible();
});

test('inscription avec un lien formateur : rattachement, remise à saisir au paiement', async ({ browser }) => {
  const code = `T${Date.now().toString(36).toUpperCase()}`;
  const coachEmail = uniqueEmail('formateur');

  // 1. Le futur formateur crée son compte.
  const coachContext = await browser.newContext();
  await signIn(await coachContext.newPage(), coachEmail);
  await coachContext.close();

  // 2. L'admin (admin@tracktout.local en mode local) le passe en formateur.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  // Gestion des utilisateurs : /admin/utilisateurs, avec une recherche par e-mail.
  await signIn(admin, 'admin@tracktout.local', `/admin/utilisateurs?q=${encodeURIComponent(coachEmail)}`);
  await expect(admin).toHaveURL(/\/admin\/utilisateurs/);
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
  // La remise du formateur se saisit sur la page de paiement Stripe (code promo) : rien n'est remisé d'office.
  await expect(page.getByText('Code formateur : −20 % sur ton premier mois')).toBeVisible();
  await expect(page.getByText(/champ « code promotionnel » de la page de paiement/)).toBeVisible();
  await page.getByRole('checkbox', { name: /démarre tout de suite/ }).check();
  await page.getByRole('button', { name: 'Choisir Pro' }).click();
  await expect(page.getByText('59,99 €')).toBeVisible();
  await page.getByRole('button', { name: 'Simuler le paiement' }).click();
  await expect(page).toHaveURL(/\/app\?paiement=ok/);
  // Radar complet, score visible.
  await page.goto('/app/radar');
  await expect(page.getByText(/autres produits à vendre aujourd’hui/)).toHaveCount(0);
  await expect(page.getByLabel(/^Score \d+ sur 100$/).first()).toBeVisible();
  await studentContext.close();
});
