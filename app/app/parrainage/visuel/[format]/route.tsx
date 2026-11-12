import { ImageResponse } from 'next/og';
import { getViewer } from '@/lib/auth/session';
import { BRAND_SLUG } from '@/lib/brand';
import { env } from '@/lib/env';
import { displayHost, SHARE_FORMATS, ShareVisual, type ShareFormat } from '@/lib/og';

export const dynamic = 'force-dynamic';

/**
 * Visuels du kit de partage (PNG) : carré 1080 × 1080 pour un post, story 1080 × 1920, lien 1200 × 630.
 * Au nom de la personne connectée (son code et son lien) ; aucun chiffre de gains, aucune promesse.
 */
export async function GET(request: Request, { params }: { params: { format: string } }) {
  const viewer = await getViewer();
  if (!viewer) return new Response('Connecte-toi pour générer tes visuels.', { status: 401 });
  if (!(params.format in SHARE_FORMATS)) return new Response('Format inconnu : carre, story ou lien.', { status: 404 });
  const format = params.format as ShareFormat;
  const code = viewer.profile.referral_code;
  const download = new URL(request.url).searchParams.get('telecharger') === '1';
  return new ImageResponse(
    (
      <ShareVisual
        format={format}
        eyebrow="TikTok Shop France"
        title="Mes produits à vendre,"
        accent="chaque matin."
        subtitle="Les produits qui montent dans mes niches, un score expliqué et des scripts vidéo prêts à tourner. En français."
        badge={`Code ${code}`}
        footer={`${displayHost(env.siteUrl)}/r/${code}`}
      />
    ),
    {
      ...SHARE_FORMATS[format],
      headers: {
        'cache-control': 'private, max-age=3600',
        ...(download ? { 'content-disposition': `attachment; filename="${BRAND_SLUG}-${format}-${code}.png"` } : {}),
      },
    },
  );
}
