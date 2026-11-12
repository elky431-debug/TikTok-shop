import { getRepo } from '@/lib/db';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe';

export const dynamic = 'force-dynamic';

/**
 * Désinscription en un clic depuis la messagerie (RFC 8058, en-tête List-Unsubscribe-Post) : la messagerie envoie un
 * POST sur l'adresse de l'en-tête List-Unsubscribe. D'après la doc Resend, on répond 200 ou 202 avec un corps vide.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('u') ?? '';
  if (!verifyUnsubscribeToken(userId, url.searchParams.get('t') ?? '')) return new Response(null, { status: 400 });
  const repo = getRepo();
  if (await repo.getProfile(userId)) await repo.updateProfile(userId, { digest_email: false });
  return new Response(null, { status: 200 });
}
