import { expect, test } from '@playwright/test';
import { completeOnboarding, signIn, uniqueEmail } from './helpers';

/**
 * Paiement en mode test.
 * - Par défaut (aucune clé) : paiement simulé, qui passe par le même traitement que les webhooks Stripe.
 * - Avec E2E_STRIPE=1 et des clés Stripe de test (sk_test_…) + `stripe listen --forward-to
 *   localhost:3200/api/stripe/webhook` : vrai Stripe Checkout avec la carte de test 4242.
 */
const realStripe = process.env.E2E_STRIPE === '1';

test('paiement : choisir Pro à l’année, ouvrir l’appli, puis résilier', async ({ page }) => {
  await signIn(page, uniqueEmail('paiement'));
  await completeOnboarding(page);

  // Pro recommandé ; en annuel : prix mensuel équivalent, montant facturé à l'année, réduction sur la bascule.
  await page.getByRole('radio', { name: /Annuel/ }).click();
  await expect(page.getByRole('radio', { name: /4 mois offerts · −33 %/ })).toBeVisible();
  await expect(page.getByText('facturé 479,90 € par an')).toBeVisible();
  await expect(page.getByText('facturé 279,90 € par an')).toBeVisible();
  await expect(page.getByText('facturé 779,90 € par an')).toBeVisible();
  for (const monthly of ['23,33 €', '39,99 €', '64,99 €']) await expect(page.getByText(monthly, { exact: false }).first()).toBeVisible();
  await page.getByRole('checkbox', { name: /démarre tout de suite/ }).check();
  await page.getByRole('button', { name: 'Choisir Pro', exact: true }).click();

  if (realStripe) {
    await page.waitForURL(/checkout\.stripe\.com/);
    await page.getByLabel(/Numéro de carte|Card number/).fill('4242 4242 4242 4242');
    await page.getByLabel(/Expiration|Expiry/).fill('12 / 34');
    await page.getByLabel(/CVC|Cryptogramme/).fill('123');
    await page.getByLabel(/Nom du titulaire|Cardholder name/).fill('Test E2E');
    await page.getByRole('button', { name: /S’abonner|Subscribe|Payer/ }).click();
    await page.waitForURL(/\/app\?paiement=ok/, { timeout: 60_000 });
  } else {
    await expect(page).toHaveURL(/\/app\/paiement-simule\?plan=pro&periode=year/);
    await expect(page.getByText('Aucune carte, aucun prélèvement')).toBeVisible();
    await page.getByRole('button', { name: 'Simuler le paiement' }).click();
    await expect(page).toHaveURL(/\/app\?paiement=ok/);
  }

  await expect(page.getByText('Ton abonnement Pro est actif')).toBeVisible();

  // Radar complet, scores visibles.
  await page.goto('/app/radar');
  await expect(page.getByText(/autres produits à vendre aujourd’hui/)).toHaveCount(0);
  await expect(page.getByLabel(/^Score \d+ sur 100$/).first()).toBeVisible();
  expect(await page.locator('a[href^="/app/produit/"]').count()).toBeGreaterThan(3);

  // Changement de plan : Pro est le plan actuel, Elite au-dessus.
  await page.goto('/app/passer-pro');
  await expect(page.getByText('Ton plan actuel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Passer à Elite' })).toBeVisible();

  if (realStripe) return; // La résiliation Stripe se teste dans le portail client.

  // Portail (simulé) : résiliation ⇒ l'appli renvoie au choix de l'abonnement.
  await page.goto('/app/compte');
  await page.getByRole('button', { name: 'Gérer mon abonnement' }).click();
  await page.getByRole('button', { name: 'Résilier mon abonnement' }).click();
  await expect(page.getByText('Abonnement résilié. L’appli se ferme à la fin de la période payée.')).toBeVisible();
  await page.goto('/app/radar');
  await expect(page).toHaveURL(/\/abonnement/);
});
