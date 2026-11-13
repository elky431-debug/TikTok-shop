import { expect, test } from '@playwright/test';
import { newOnboardedUser } from './helpers';

/**
 * Paiement en mode test.
 * - Par défaut (aucune clé) : paiement simulé, qui passe par le même traitement que les webhooks Stripe.
 * - Avec E2E_STRIPE=1 et des clés Stripe de test (sk_test_…) + `stripe listen --forward-to
 *   localhost:3200/api/stripe/webhook` : vrai Stripe Checkout avec la carte de test 4242.
 */
const realStripe = process.env.E2E_STRIPE === '1';

test('paiement : passer Pro, voir tout le radar, puis résilier', async ({ page }) => {
  await newOnboardedUser(page, 'paiement');
  await page.goto('/app/radar');
  await expect(page.getByText(/autres produits à vendre aujourd’hui/)).toBeVisible();

  await page.getByRole('link', { name: 'Passer Pro' }).first().click();
  await expect(page).toHaveURL(/\/app\/passer-pro/);
  await page.getByRole('radio', { name: /Annuel/ }).click();
  await expect(page.getByText('167 € / an')).toBeVisible();
  await page.getByRole('button', { name: 'Passer Pro', exact: true }).click();

  if (realStripe) {
    await page.waitForURL(/checkout\.stripe\.com/);
    await page.getByLabel(/Numéro de carte|Card number/).fill('4242 4242 4242 4242');
    await page.getByLabel(/Expiration|Expiry/).fill('12 / 34');
    await page.getByLabel(/CVC|Cryptogramme/).fill('123');
    await page.getByLabel(/Nom du titulaire|Cardholder name/).fill('Test E2E');
    await page.getByRole('button', { name: /S’abonner|Subscribe|Payer/ }).click();
    await page.waitForURL(/\/app\/compte\?paiement=ok/, { timeout: 60_000 });
  } else {
    await expect(page).toHaveURL(/\/app\/paiement-simule\?plan=pro&periode=year/);
    await expect(page.getByText('Aucune carte, aucun prélèvement')).toBeVisible();
    await page.getByRole('button', { name: 'Simuler le paiement' }).click();
    await expect(page).toHaveURL(/\/app\/compte\?paiement=ok/);
  }

  await expect(page.getByText('Paiement confirmé : ton plan est actif. Bienvenue !')).toBeVisible();
  await expect(page.locator('#abonnement').getByText('Pro', { exact: true })).toBeVisible();

  // Radar complet : plus de produits verrouillés, scores visibles.
  await page.goto('/app/radar');
  await expect(page.getByText(/autres produits à vendre aujourd’hui/)).toHaveCount(0);
  await expect(page.getByLabel(/^Score \d+ sur 100$/).first()).toBeVisible();
  expect(await page.locator('a[href^="/app/produit/"]').count()).toBeGreaterThan(3);

  if (realStripe) return; // La résiliation Stripe se teste dans le portail client.

  // Portail (simulé) : résiliation ⇒ retour au plan Gratuit.
  await page.goto('/app/compte');
  await page.getByRole('button', { name: 'Gérer mon abonnement' }).click();
  await page.getByRole('button', { name: 'Résilier mon abonnement' }).click();
  await expect(page.getByText('Abonnement résilié. Tu repasses en Gratuit.')).toBeVisible();
  await page.goto('/app/radar');
  await expect(page.getByText(/autres produits à vendre aujourd’hui/)).toBeVisible();
});
