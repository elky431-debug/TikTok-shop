import { expect, type Page } from '@playwright/test';

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@exemple.fr`;
}

/** Connexion par lien magique (mode local : le lien s'affiche à l'écran). */
export async function signIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/connexion?suite=${encodeURIComponent(next)}` : '/connexion');
  await page.getByRole('button', { name: /Reçois un lien de connexion/ }).click();
  await page.getByLabel('Ton adresse e-mail').fill(email);
  await page.getByRole('button', { name: 'Recevoir mon lien magique' }).click();
  await expect(page.getByText('Lien magique envoyé')).toBeVisible();
  await page.getByTestId('lien-magique-local').click();
}

/** Inscription par e-mail et mot de passe, depuis la page de connexion déjà ouverte. */
export async function signUpWithPassword(page: Page, email: string, password = 'motdepasse-solide-42') {
  await page.getByLabel('Ton adresse e-mail').fill(email);
  await page.getByLabel('Ton mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).last().click();
}

/**
 * Onboarding complet : 10 questions, une par écran (pseudo, objectif et code passés), puis « On prépare ton radar » et
 * le dashboard.
 */
export async function completeOnboarding(
  page: Page,
  opts: { firstName?: string; range?: string; affiliate?: string; niches?: string[]; style?: RegExp; code?: string } = {},
) {
  await expect(page).toHaveURL(/\/bienvenue/);
  await page.getByLabel('Ton prénom').fill(opts.firstName ?? 'Léa');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Passer' }).click();
  await page.getByRole('radio', { name: opts.range ?? 'Entre 5 000 et 20 000' }).click();
  await page.getByRole('radio', { name: opts.affiliate ?? 'Oui' }).click();
  await page.getByRole('radio', { name: /Quelques ventes/i }).click();
  for (const niche of opts.niches ?? ['Beauté']) await page.getByRole('checkbox', { name: niche }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: /4 à 7 vidéos/ }).click();
  await page.getByRole('checkbox', { name: opts.style ?? /Face caméra/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Passer' }).click();
  if (opts.code) {
    await page.getByLabel('Code formateur').fill(opts.code);
    await page.getByRole('button', { name: 'Préparer mon radar' }).click();
  } else if (await page.getByRole('button', { name: 'Passer' }).isVisible()) {
    await page.getByRole('button', { name: 'Passer' }).click();
  } else {
    await page.getByRole('button', { name: 'Préparer mon radar' }).click();
  }
  await expect(page).toHaveURL(/\/app\?bienvenue=/, { timeout: 30_000 });
}

export async function newOnboardedUser(page: Page, prefix: string) {
  await signIn(page, uniqueEmail(prefix));
  await completeOnboarding(page);
}
