import { ImageResponse } from 'next/og';
import { nicheLabel } from '@/lib/niches';
import { SHARE_FORMATS, ShareVisual } from '@/lib/og';
import { getVeilleSelection, isPublishedNiche } from '@/lib/tendances';
import { formatDayMonth } from '@/lib/utils';

/** Image de partage d'une catégorie : son nom et la date du relevé, aucun chiffre de gains. */
export const alt = 'Produits tendance TikTok Shop France';
export const size = SHARE_FORMATS.lien;
export const contentType = 'image/png';
export const revalidate = 3600;

export default async function Image({ params }: { params: { niche: string } }) {
  const selection = await getVeilleSelection();
  const published = isPublishedNiche(selection, params.niche);
  return new ImageResponse(
    (
      <ShareVisual
        eyebrow="TikTok Shop France"
        title="Produits tendance"
        accent={published ? `${nicheLabel(params.niche).toLowerCase()}.` : 'chaque jour.'}
        subtitle={published && selection.date ? `Relevé du ${formatDayMonth(selection.date)} · mis à jour chaque jour` : 'Mis à jour chaque jour'}
      />
    ),
    { ...size },
  );
}
