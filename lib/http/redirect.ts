import { NextResponse } from 'next/server';

/**
 * Redirection relative (« Location: /chemin ») : le navigateur reste sur l'adresse qu'il utilise. Sur Netlify,
 * `request.url` vaut l'adresse interne du déploiement (ex. `branche--site.netlify.app`), pas l'adresse publique :
 * l'utiliser renvoyait la personne sur un autre domaine, sans ses cookies. Un chemin qui n'est pas local devient « / ».
 */
export function relativeRedirect(path: string, status: 302 | 303 | 307 = 303): NextResponse {
  const safe = path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/';
  return new NextResponse(null, { status, headers: { Location: safe } });
}
