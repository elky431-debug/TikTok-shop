import type { Profile } from '@/lib/db/types';
import { nicheShort } from '@/lib/niches';
import { videoStyleLabel } from '@/lib/profile-rules';

/** Étapes pour demander un échantillon gratuit dans l'appli TikTok (sans automatisation). */
export const SAMPLE_STEPS = [
  'Dans l’appli TikTok, ouvre ton profil puis l’espace créateur TikTok Shop (rubrique affiliation).',
  'Cherche le produit par son nom, ouvre sa fiche et appuie sur « Demander un échantillon gratuit ».',
  'Choisis ton adresse, colle le message ci-dessous dans le champ prévu pour le vendeur, puis envoie.',
];

/** Message de demande d'échantillon, prêt à copier. Aucune promesse de ventes. */
export function sampleRequestMessage(profile: Pick<Profile, 'first_name' | 'tiktok_handle' | 'niches' | 'video_style'>, productName: string): string {
  const who = [profile.first_name, profile.tiktok_handle ? `(@${profile.tiktok_handle})` : null].filter(Boolean).join(' ');
  const niche = profile.niches[0] ? nicheShort(profile.niches[0]).toLowerCase() : 'lifestyle';
  const style = profile.video_style ? videoStyleLabel(profile.video_style).toLowerCase() : 'démonstration';
  return [
    `Bonjour,`,
    `Je suis ${who || 'créateur·rice de contenu'}, je publie des vidéos ${niche} en format ${style}.`,
    `J’aimerais présenter «\u00a0${productName}\u00a0» à mon audience. Je prévois au moins 3 vidéos dans les 10 jours après réception, avec une démonstration honnête du produit.`,
    `Merci pour votre retour !`,
  ].join('\n');
}
