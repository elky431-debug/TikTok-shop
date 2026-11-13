import { expect, test } from '@playwright/test';
import { adminClient, cleanupRun, magicLinkTokenHash, supabaseReady, testEmail } from '../helpers';

/**
 * Parcours de connexion réel dans le navigateur, contre Supabase : lien magique (même URL que le modèle
 * d'e-mail du README), redirections, pages protégées, déconnexion, et Google si E2E_GOOGLE=1.
 * Aucun e-mail n'est envoyé : le lien est généré côté admin, exactement comme Supabase le mettrait dans l'e-mail.
 */

test.skip(!supabaseReady, 'Clés Supabase absentes : parcours ignoré.');

const created: string[] = [];

test.afterAll(async () => {
  if (supabaseReady) await cleanupRun(created);
});

async function profileId(email: string): Promise<string> {
  const { data, error } = await adminClient().from('profiles').select('id').eq('email', email).single();
  if (error) throw new Error(error.message);
  return data.id;
}

function callbackUrl(tokenHash: string, suite: string): string {
  return `/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&suite=${encodeURIComponent(suite)}`;
}

test('inscription par mot de passe : accueil → Commencer → compte → onboarding → radar, sans aucun e-mail', async ({ page }) => {
  // Supabase refuse les adresses en example.com à l'inscription publique : domaine du produit, aucun e-mail n'est envoyé
  // (confirmation désactivée tant que Resend n'est pas branché).
  const email = testEmail('motdepasse').replace('@example.com', '@tracktout.com');
  await page.goto('/');
  await page.getByRole('button', { name: /ouvrir le menu/i }).click();
  await page.getByRole('link', { name: 'Commencer' }).last().click();
  await expect(page).toHaveURL(/\/connexion/);
  await page.getByLabel('Ton adresse e-mail').fill(email);
  await page.getByLabel('Ton mot de passe').fill('motdepasse-solide-42');
  await page.getByRole('button', { name: 'Créer mon compte' }).last().click();
  await expect(page).toHaveURL(/\/bienvenue/);
  created.push(await profileId(email));

  // Onboarding : 10 questions, une par écran (les facultatives passées).
  await page.getByLabel('Ton prénom').fill('Inès');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Passer' }).click();
  await page.getByRole('radio', { name: 'Moins de 1 000' }).click();
  await page.getByRole('radio', { name: 'Je ne sais pas' }).click();
  await page.getByRole('radio', { name: /Je débute/ }).click();
  await page.getByRole('checkbox', { name: 'Beauté' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: /1 à 3 vidéos/ }).click();
  await page.getByRole('checkbox', { name: /Voix off/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Passer' }).click();
  await page.getByRole('button', { name: 'Passer' }).click();
  await expect(page).toHaveURL(/\/app\?bienvenue=/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard de Inès');

  // Reconnexion par mot de passe dans un navigateur neuf
  await page.context().clearCookies();
  await page.goto('/connexion?mode=connexion');
  await page.getByLabel('Ton adresse e-mail').fill(email);
  await page.getByLabel('Ton mot de passe').fill('motdepasse-solide-42');
  await page.getByRole('button', { name: 'Me connecter' }).last().click();
  await expect(page).toHaveURL(/\/app$/);
});

test('lien magique : onboarding d’abord, puis la page demandée, puis déconnexion', async ({ page, baseURL }) => {
  await page.goto('/app/scripts');
  await expect(page).toHaveURL(/\/connexion\?suite=%2Fapp%2Fscripts$/);

  const email = testEmail('navigateur');
  const hash = await magicLinkTokenHash(email, `${baseURL}/auth/callback?suite=%2Fapp%2Fscripts`);
  await page.goto(callbackUrl(hash, '/app/scripts'));
  await expect(page).toHaveURL(/\/bienvenue$/);
  const id = await profileId(email);
  created.push(id);

  // Onboarding terminé (raccourci côté admin) : la page demandée s'ouvre.
  await adminClient()
    .from('profiles')
    .update({
      first_name: 'Test',
      niches: ['beaute'],
      follower_range: '0-1000',
      video_style: 'face_camera',
      video_styles: ['face_camera'],
      onboarding_version: 2,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', id);
  await page.goto('/app/scripts');
  await expect(page).toHaveURL(/\/app\/scripts$/);

  await page.goto('/app/compte');
  await page.getByRole('button', { name: 'Me déconnecter' }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/connexion\?suite=%2Fapp$/);
});

test('un lien déjà utilisé ou forgé renvoie vers la connexion avec un message clair', async ({ page }) => {
  await page.goto(callbackUrl('lien-invalide', '/app'));
  await expect(page).toHaveURL(/\/connexion\?erreur=lien-expire/);
  await expect(page.getByText('Ce lien a expiré ou a déjà servi.')).toBeVisible();
});

test('une redirection vers un autre site est refusée', async ({ page, baseURL }) => {
  const email = testEmail('redirection');
  const hash = await magicLinkTokenHash(email);
  await page.goto(callbackUrl(hash, '//exemple-malveillant.test/'));
  created.push(await profileId(email));
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
});

test('Google : le bouton mène à la page de connexion Google', async ({ page }) => {
  test.skip(process.env.E2E_GOOGLE !== '1', 'Google non vérifié : lance avec E2E_GOOGLE=1 une fois le fournisseur activé dans Supabase.');
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Continuer avec Google' }).click();
  await page.waitForURL(/accounts\.google\.com/, { timeout: 30_000 });
});
