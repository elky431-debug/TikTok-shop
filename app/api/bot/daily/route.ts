import { NextResponse } from 'next/server';
import { botUnauthorized } from '@/lib/bot-auth';
import { getRepo } from '@/lib/db';
import { env } from '@/lib/env';
import { nicheShort } from '@/lib/niches';
import { commissionPerSale, TREND_LABELS } from '@/lib/score';
import { parisDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Masque un nom : « Sérum ██████ ». Aucune information exploitable pour les non-abonnés. */
function mask(name: string): string {
  const [first, ...rest] = name.split(' ');
  return `${first} ${rest.map((w) => '█'.repeat(Math.min(6, w.length))).join(' ')}`.trim();
}

/** Contenu du salon « produits-du-jour » : 3 produits masqués en public, le reste pour les rôles Pro. */
export async function GET(request: Request) {
  const denied = botUnauthorized(request);
  if (denied) return denied;
  const products = (await getRepo().listProducts()).slice(0, 10);
  const view = products.map((p) => ({
    name: p.name,
    niche: nicheShort(p.niche),
    score: p.latest_score,
    price_cents: p.price_cents,
    commission_cents: commissionPerSale(p.price_cents, p.commission_rate),
    trend: TREND_LABELS[p.trend],
    growth_7d: p.growth_7d,
    free_sample: p.free_sample,
    url: `${env.siteUrl}/app/produit/${p.id}`,
  }));
  return NextResponse.json({
    day: products[0]?.snapshot_date ?? parisDate(),
    site_url: env.siteUrl,
    teaser: view.slice(0, 3).map((p) => ({ masked_name: mask(p.name), niche: p.niche, trend: p.trend, growth_7d: p.growth_7d })),
    full: view,
  });
}
