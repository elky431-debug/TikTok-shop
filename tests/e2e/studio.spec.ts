import { expect, test } from '@playwright/test';
import { newOnboardedUser } from './helpers';

test('génération de scripts (Starter) : 5 formats, 10 accroches, 3 scripts, régénérer, garder, historique', async ({ page }) => {
  await newOnboardedUser(page, 'studio', 'Starter');

  // Depuis le radar : fiche produit puis « Écrire mes scripts »
  await page.goto('/app/radar');
  const firstProduct = page.locator('a[href^="/app/produit/"]').first();
  const productName = (await firstProduct.locator('h2, h3').first().textContent())?.trim() ?? '';
  await firstProduct.click();
  await page.getByRole('link', { name: 'Écrire mes scripts' }).click();
  await expect(page).toHaveURL(/\/app\/studio\?produit=/);
  await expect(page.getByText('Il te reste 10 écritures aujourd’hui.')).toBeVisible();
  // Starter : 5 formats ouverts, les 3 autres visibles mais fermés (inclus avec Pro).
  await expect(page.getByRole('radio', { name: /Comparaison/ })).toBeDisabled();
  await expect(page.getByRole('radio', { name: /Déballage/ })).toBeEnabled();

  await page.getByText('Réponse à un commentaire', { exact: true }).click();
  await page.getByRole('button', { name: 'Écrire mes scripts' }).click();

  // Résultat
  await expect(page).toHaveURL(/\/app\/studio\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(productName);
  await expect(page.locator('#accroches li')).toHaveCount(10);
  await expect(page.getByRole('tab', { name: /^Script \d/ })).toHaveCount(3);
  await expect(page.getByText(/#publicité/).first()).toBeVisible();
  // Onglet 2 : son texte s'affiche ; « Détails du tournage » reste replié.
  await page.getByRole('tab', { name: /^Script 2/ }).click();
  await expect(page.locator('#script-2')).toBeVisible();
  await expect(page.locator('#script-1')).toBeHidden();
  await expect(page.locator('#script-2').getByRole('button', { name: 'Copier le script' })).toBeVisible();
  await expect(page.getByText('Mode démo : scripts simulés')).toBeVisible();

  // Régénérer la première accroche
  const firstHook = page.locator('#accroches [data-hook]').first();
  const before = await firstHook.textContent();
  await page.getByRole('button', { name: 'Nouvelle accroche à la place de la n°1', exact: true }).click();
  await expect(page).toHaveURL(/nouvelle=0/);
  await expect(firstHook).not.toHaveText(before ?? '');

  // Copier une accroche d'un clic, tout copier depuis le menu, puis garder (étoile)
  await page.locator('#accroches li').nth(1).getByRole('button', { name: /^Copier l’accroche 2/ }).click();
  await expect(page.getByRole('button', { name: 'Accroche 2 copiée' })).toBeVisible();
  await page.getByRole('button', { name: 'Plus d’actions' }).click();
  await page.getByRole('button', { name: 'Copier tout' }).click();
  await expect(page.getByText('Tout est copié')).toBeVisible();
  await page.getByRole('button', { name: 'Garder ce script' }).click();
  await expect(page.getByRole('button', { name: 'Script gardé' })).toBeVisible();

  // Historique et compteur du plan Starter
  await page.goto('/app/studio?gardes=1');
  await expect(page.getByRole('link', { name: new RegExp(productName) })).toBeVisible();
  await expect(page.getByText('Il te reste 9 écritures aujourd’hui.')).toBeVisible();
});
