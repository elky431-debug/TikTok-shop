import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { getPlan } from '@/lib/plans';
import { getRadar, parseFilters } from '@/lib/radar';
import { radarToCsv } from '@/lib/radar/export';
import { parisDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Export CSV du radar filtré, avec le tri mémorisé (plan Pro+ uniquement, vérifié ici côté serveur). Passe par
 * `getRadar` : exactement les produits que l'utilisateur voit, jamais un produit verrouillé.
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL('/connexion?suite=/app', request.url));
  if (!viewer.profile.onboarded_at) return NextResponse.redirect(new URL('/bienvenue', request.url));
  if (!getPlan(viewer.profile.plan).radarExport) {
    return NextResponse.json({ error: 'L’export du radar est réservé au plan Pro+.' }, { status: 403 });
  }
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const radar = await getRadar(viewer.profile, parseFilters(params));
  return new NextResponse(radarToCsv(radar.items, env.siteUrl), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="radar-${radar.date ?? parisDate()}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
