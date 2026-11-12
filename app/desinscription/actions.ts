'use server';

import { redirect } from 'next/navigation';
import { applyUnsubscribe } from '@/lib/lifecycle/unsubscribe';
import { parseUnsubscribeList, verifyUnsubscribeToken } from '@/lib/unsubscribe';

/** Désinscription depuis la page (un clic sur le bouton), sans connexion, grâce au jeton du lien. */
export async function unsubscribeAction(formData: FormData) {
  const userId = String(formData.get('u') ?? '');
  const token = String(formData.get('t') ?? '');
  const list = parseUnsubscribeList(String(formData.get('l') ?? ''));
  const suffix = list && list !== 'matin' ? `&l=${list}` : '';
  if (!list || !verifyUnsubscribeToken(userId, token, list)) redirect(`/desinscription?etat=lien-invalide${suffix}`);
  await applyUnsubscribe(userId, list);
  redirect(`/desinscription?etat=fait${suffix}`);
}
