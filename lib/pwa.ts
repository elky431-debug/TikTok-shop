import type { Metadata, MetadataRoute } from 'next';
import { BRAND, BRAND_TAGLINE } from '@/lib/brand';

/**
 * Appli installable (bloc 15). Le manifeste suit les membres du « Web App Manifest » (W3C) tels que Next les type
 * (`MetadataRoute.Manifest`) : nom, couleurs, affichage autonome, icônes 192/512 et « maskable ». Android compose son
 * écran de démarrage avec `name`, `background_color` et l'icône 512 ; iOS demande ses propres images (voir plus bas).
 */
export const PWA_BACKGROUND = '#000000';
export const PWA_THEME = '#000000';

export function webManifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: BRAND,
    short_name: BRAND,
    description: `${BRAND_TAGLINE}. Tes produits TikTok Shop du jour, tes scripts et ton récap, en français.`,
    lang: 'fr',
    dir: 'ltr',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: PWA_BACKGROUND,
    theme_color: PWA_THEME,
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Produits du jour', short_name: 'Radar', url: '/app', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Écrire un script', short_name: 'Studio', url: '/app/studio', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Récap du matin', short_name: 'Récap', url: '/app/recap', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}

/** Écrans iOS (portrait) pour lesquels une image de démarrage existe : largeur et hauteur CSS, densité. */
export const IOS_SPLASH_SCREENS: Array<[number, number, number]> = [
  [440, 956, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 2],
  [375, 667, 2],
];

/**
 * Réglages iOS de l'appli ajoutée à l'écran d'accueil : titre, barre d'état noire, écrans de démarrage (une image par
 * taille d'écran, choisie par media query). Images produites par `python3 scripts/pwa-icons.py`.
 */
export const appleWebApp: NonNullable<Metadata['appleWebApp']> = {
  capable: true,
  title: BRAND,
  statusBarStyle: 'black',
  startupImage: IOS_SPLASH_SCREENS.map(([w, h, dpr]) => ({
    url: `/icons/splash/splash-${w * dpr}x${h * dpr}.png`,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
  })),
};
