import { getViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';

/** Boîte de réception locale (mode local) : affiche un e-mail tel qu'il serait envoyé. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return new Response('Accès réservé à l’administration.', { status: 403 });
  const repo = getRepo();
  const email = (await repo.listLocalEmails?.(50))?.find((e) => e.id === params.id);
  if (!email) return new Response('E-mail introuvable.', { status: 404 });
  return new Response(email.html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
