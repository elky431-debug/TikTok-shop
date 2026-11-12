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
    .update({ first_name: 'Test', niches: ['beaute'], follower_range: '0-500', video_style: 'face_camera', onboarded_at: new Date().toISOString() })
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
