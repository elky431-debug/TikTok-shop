import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker';
import { THEME_COOKIE } from '@/lib/auth/constants';
import { BRAND, BRAND_TAGLINE } from '@/lib/brand';
import { env } from '@/lib/env';
import { appleWebApp } from '@/lib/pwa';
import './globals.css';

// Sora, la police d'EtSmart (Google Fonts, licence OFL), auto-hébergée : aucun appel à Google.
const sans = localFont({
  src: './fonts/Sora-latin-wght.woff2',
  variable: '--font-sans',
  weight: '100 800',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Arial'],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: `${BRAND} · ${BRAND_TAGLINE}`, template: `%s · ${BRAND}` },
  description:
    "Chaque matin, les produits TikTok Shop à vendre dans tes niches, avec un score expliqué et des scripts vidéo prêts à tourner. En français.",
  applicationName: BRAND,
  openGraph: { locale: 'fr_FR', siteName: BRAND, type: 'website' },
  // Appli installable (manifeste : app/manifest.ts) : réglages iOS de l'écran d'accueil.
  appleWebApp,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
};

// Le noir est le thème par défaut. Le clair n'est appliqué que s'il a été choisi dans le compte,
// avant l'affichage et sans rendre les pages dynamiques.
const themeScript = `try{if(/(?:^|; )${THEME_COOKIE}=light/.test(document.cookie))document.documentElement.setAttribute('data-theme','light')}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Sans JavaScript, les éléments animés à l'apparition restent visibles. */}
        <noscript>
          <style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important;filter:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-dvh font-sans">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-bg"
        >
          Aller au contenu
        </a>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
