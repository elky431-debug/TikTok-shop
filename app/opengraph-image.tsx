import { ImageResponse } from 'next/og';
import { BRAND_TAGLINE } from '@/lib/brand';
import { SHARE_FORMATS, ShareVisual } from '@/lib/og';

/** Image de partage par défaut du site (remplacée par celle d'une page quand elle en a une). */
export const alt = BRAND_TAGLINE;
export const size = SHARE_FORMATS.lien;
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <ShareVisual
        eyebrow="TikTok Shop France"
        title="Sache chaque matin"
        accent="quoi vendre."
        subtitle="Les produits qui montent dans tes niches, un score expliqué et des scripts vidéo prêts à tourner. En français."
      />
    ),
    { ...size },
  );
}
