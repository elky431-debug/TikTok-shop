import { applyUnsubscribe } from '@/lib/lifecycle/unsubscribe';
import { parseUnsubscribeList, verifyUnsubscribeToken } from '@/lib/unsubscribe';

export const dynamic = 'force-dynamic';

/**
 * Désinscription en un clic depuis la messagerie (RFC 8058, en-tête List-Unsubscribe-Post) : la messagerie envoie un
 * POST sur l'adresse de l'en-tête List-Unsubscribe. D'après la doc Resend, on répond 200 ou 202 avec un corps vide.
 * Paramètre `l` : la liste (absent = récap du matin, comme les liens déjà envoyés) ; le jeton est propre à la liste.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('u') ?? '';
  const list = parseUnsubscribeList(url.searchParams.get('l'));
  if (!list || !verifyUnsubscribeToken(userId, url.searchParams.get('t') ?? '', list)) return new Response(null, { status: 400 });
  await applyUnsubscribe(userId, list);
  return new Response(null, { status: 200 });
}
