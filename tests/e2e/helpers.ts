import { expect, type Page } from '@playwright/test';

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@exemple.fr`;
}

/** Connexion par lien magique (mode local : le lien s'affiche à l'écran). */
export async function signIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/connexion?suite=${encodeURIComponent(next)}` : '/connexion');
  await page.getByLabel('Ton adresse e-mail').fill(email);
  await page.getByRole('button', { name: 'Recevoir mon lien magique' }).click();
  await expect(page.getByText('Lien magique envoyé')).toBeVisible();
  await page.getByTestId('lien-magique-local').click();
}

/**
 * Onboarding complet : 3 écrans de profil, puis les produits du jour (étape passée ici) et l'offre Pro
 * (« Continuer en Gratuit », ou « Ouvrir mon radar » pendant l'essai offert par un formateur).
 */
export async function completeOnboarding(
  page: Page,
  opts: { firstName?: string; range?: string; niches?: string[]; style?: string } = {},
) {
  await expect(page).toHaveURL(/\/bienvenue/);
  await page.getByLabel('Ton prénom').fill(opts.firstName ?? 'Léa');
  await page.getByText(opts.range ?? 'Entre 1 500 et 5 000', { exact: true }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/etape=2/);
  for (const niche of opts.niches ?? ['Beauté et soins']) await page.getByText(niche, { exact: true }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/etape=3/);
  await page.getByText(opts.style ?? 'Face caméra', { exact: true }).click();
  await page.getByRole('button', { name: 'Voir mes 3 produits du jour' }).click();
  await expect(page).toHaveURL(/\/bienvenue\/produits/);
  await page.getByRole('link', { name: 'Passer cette étape' }).click();
  await expect(page).toHaveURL(/\/bienvenue\/pro/);
  await page.getByRole('link', { name: /^(Ouvrir mon radar|Continuer en Gratuit)$/ }).click();
  await expect(page).toHaveURL(/\/app\?bienvenue=/);
}

export async function newOnboardedUser(page: Page, prefix: string) {
  await signIn(page, uniqueEmail(prefix));
  await completeOnboarding(page);
}
