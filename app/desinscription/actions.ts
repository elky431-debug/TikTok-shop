'use server';

import { redirect } from 'next/navigation';
import { getRepo } from '@/lib/db';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe';

/** Désinscription depuis la page (un clic sur le bouton), sans connexion, grâce au jeton du lien. */
export async function unsubscribeAction(formData: FormData) {
  const userId = String(formData.get('u') ?? '');
  const token = String(formData.get('t') ?? '');
  if (!verifyUnsubscribeToken(userId, token)) redirect('/desinscription?etat=lien-invalide');
  const repo = getRepo();
  if (await repo.getProfile(userId)) await repo.updateProfile(userId, { digest_email: false });
  redirect('/desinscription?etat=fait');
}
