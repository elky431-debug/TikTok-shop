import { render } from '@react-email/render';
import { createElement } from 'react';
import { MorningDigestEmail } from '@/emails/morning-digest';
import { getViewer } from '@/lib/auth/session';
import { getTodayDigest } from '@/lib/digest/today';
import { env } from '@/lib/env';

/** Aperçu HTML de l'e-mail du récap du jour (utilisateur connecté). */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.redirect(new URL('/connexion?suite=/app/recap', request.url));
  const digest = await getTodayDigest(viewer.profile);
  const html = await render(createElement(MorningDigestEmail, { content: digest.content, siteUrl: env.siteUrl }));
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
