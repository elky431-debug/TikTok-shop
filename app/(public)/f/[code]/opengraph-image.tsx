import { ImageResponse } from 'next/og';
import { COACH_TRIAL_DAYS } from '@/lib/plans';
import { SHARE_FORMATS, ShareVisual } from '@/lib/og';
import { describeCode, normalizeCode } from '@/lib/referral';

/** Image de partage de la page co-brandée : nom de la formation, code et offre (sans aucun chiffre de gains). */
export const alt = 'Mois de Pro offerts par ton formateur';
export const size = SHARE_FORMATS.lien;
export const contentType = 'image/png';
export const revalidate = 600;

export default async function Image({ params }: { params: { code: string } }) {
  const found = await describeCode(normalizeCode(decodeURIComponent(params.code)));
  const months = Math.round(COACH_TRIAL_DAYS / 30);
  return new ImageResponse(
    found.kind === 'coach' ? (
      <ShareVisual
        eyebrow={`Proposé par ${found.coach.training_name}`.slice(0, 60)}
        title={`${months} mois de Pro`}
        accent="offerts."
        subtitle="Les produits TikTok Shop qui montent, chaque matin, et tes scripts vidéo prêts à tourner."
        badge={`Code ${found.code}`}
      />
    ) : (
      <ShareVisual title="Les produits TikTok Shop" accent="qui montent, chaque matin." />
    ),
    { ...size },
  );
}
