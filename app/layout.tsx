import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { THEME_COOKIE } from '@/lib/auth/constants';
import { BRAND, BRAND_TAGLINE } from '@/lib/brand';
import { env } from '@/lib/env';
import './globals.css';

const sans = localFont({
  src: './fonts/TikTokSans-latin-wght.woff2',
  variable: '--font-sans',
  weight: '300 900',
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
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#161823' },
  ],
};

// Applique le thème forcé (clair/sombre) avant l'affichage, sans rendre les pages dynamiques.
const themeScript = `try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);if(m)document.documentElement.setAttribute('data-theme',m[1])}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-bg"
        >
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
