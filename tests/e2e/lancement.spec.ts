import { expect, test } from '@playwright/test';
import { newOnboardedUser } from './helpers';

/**
 * « Lancer un produit », de bout en bout (mode local isolé : scripts simulés, aucun appel à TikTok) : choix sur le radar,
 * échantillon, scripts, planning, tournage, publication avec un lien de vidéo TikTok, résultats ; le statut du dashboard
 * suit chaque étape et se corrige au menu déroulant.
 */
test('lancer un produit : du radar à la vidéo en ligne, statut du dashboard à chaque étape', async ({ page }) => {
  test.setTimeout(240_000);
  await newOnboardedUser(page, 'lancement', 'Pro');

  async function stageOf(name: string) {
    await page.goto('/app?onglet=produits#gestion');
    const row = page.locator('#gestion table tbody tr', { hasText: name });
    return row.getByRole('combobox', { name: `Statut de ${name}` });
  }

  // 1. Produit : « Lancer ce produit » sur le radar
  await page.goto('/app/radar');
  await page.getByRole('button', { name: 'Lancer ce produit' }).first().click();
  await expect(page).toHaveURL(/\/app\/lancer\/[\w-]+\?etape=echantillon/);
  const launchUrl = page.url().split('?')[0];
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demande ton échantillon');
  const name = (await page.locator('main p.truncate').first().textContent())!.trim();
  await expect(await stageOf(name)).toHaveValue('a_lancer');

  // 2. Échantillon : demandé, puis reçu
  await page.goto(`${launchUrl}?etape=echantillon`);
  await expect(page.getByRole('button', { name: 'Copier le message' })).toBeVisible();
  await page.getByLabel('Échantillon demandé').check();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Demande notée.')).toBeVisible();
  await expect(await stageOf(name)).toHaveValue('echantillon_demande');
  await page.goto(`${launchUrl}?etape=echantillon`);
  await page.getByLabel('Échantillon reçu').check();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page).toHaveURL(/etape=scripts/);
  await expect(await stageOf(name)).toHaveValue('echantillon_recu');

  // 3. Scripts : écrits dans l'étape, un script gardé
  await page.goto(`${launchUrl}?etape=scripts`);
  await expect(page.getByRole('button', { name: 'Étape suivante' })).toBeDisabled();
  await page.getByRole('button', { name: 'Écrire mes scripts' }).click();
  await expect(page).toHaveURL(/ecrit=/);
  await page.getByRole('button', { name: 'Garder pour une vidéo' }).first().click();
  await expect(page.getByRole('button', { name: 'Gardé · vidéo n°1' })).toBeVisible();
  await page.getByRole('button', { name: 'Étape suivante' }).click();
  await expect(page).toHaveURL(/etape=planifier/);
  await expect(await stageOf(name)).toHaveValue('scripts_prets');

  // 4. Planifier : répartition au rythme de l'onboarding, puis une vidéo déplacée (au toucher)
  await page.goto(`${launchUrl}?etape=planifier`);
  await page.getByRole('button', { name: 'Planifier mes vidéos' }).click();
  await expect(page.getByText('Vidéos réparties dans ton calendrier.')).toBeVisible();
  await page.getByRole('button', { name: /^Vidéo n°1 / }).click();
  const targets = page.getByRole('button', { name: /^Mettre la vidéo n°1 le / });
  await targets.last().click();
  await expect(page.getByRole('status').filter({ hasText: 'Vidéo n°1 déplacée' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Étape suivante' }).click();
  await expect(page).toHaveURL(/etape=tourner/);

  // 5. Tourner : la vidéo n°1 a son script et son téléprompteur
  await expect(page.getByRole('button', { name: 'Téléprompteur' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Vidéo n°1 tournée' }).click();
  await expect(page.getByRole('button', { name: 'Vidéo n°1 tournée' })).toHaveAttribute('aria-pressed', 'true');
  await expect(await stageOf(name)).toHaveValue('en_tournage');
  await page.goto(`${launchUrl}?etape=tourner`);
  await page.getByRole('button', { name: 'Étape suivante' }).click();
  await expect(page).toHaveURL(/etape=publier/);

  // 6. Publier : le lien de la vidéo la passe en ligne
  await page.getByLabel('Lien de ta vidéo n°1 sur TikTok').fill('https://www.tiktok.com/@labras3/video/7685364570164088097');
  await page.getByRole('button', { name: 'C’est en ligne' }).click();
  await expect(page.getByText('Ta première vidéo est en ligne, bravo !').first()).toBeAttached();
  await expect(page.locator('iframe[title="Vidéo n°1 sur TikTok"]')).toHaveCount(1);
  await expect(await stageOf(name)).toHaveValue('en_ligne');

  // 7. Résultats : vues, ventes, commission
  await page.goto(`${launchUrl}?etape=resultats`);
  await page.locator('#resultat-1 input[name=vues]').fill('1200');
  await page.locator('#resultat-1 input[name=ventes]').fill('2');
  await page.locator('#resultat-1').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Chiffres enregistrés.')).toBeVisible();
  await page.getByLabel('Montant (€)').fill('9,90');
  await page.getByRole('button', { name: 'Ajouter la commission' }).click();
  await expect(page.getByText('Commission ajoutée.')).toBeVisible();
  await expect(page.getByText('Continue à poster sur ce produit')).toBeVisible();

  // Statut corrigé à la main : « Terminé » range le lancement dans l'historique.
  const select = await stageOf(name);
  await select.selectOption('termine');
  await expect(page).toHaveURL(/ok=statut/);
  await expect(page.locator('#gestion table tbody tr', { hasText: name })).toHaveCount(0);
  await page.goto('/app/lancer');
  await expect(page.locator('#historique').getByText(name)).toBeVisible();
});
