/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { BRAND_SPLIT } from '@/lib/brand';

/**
 * Visuels de partage générés par `ImageResponse` (next/og, rendu par Satori) : fond noir, dégradé cyan → rose,
 * logo en deux tons. Satori n'accepte que des boîtes flex et un sous-ensemble du CSS ; la police est celle fournie
 * par next/og (Noto Sans) : Sora n'existe qu'en woff2, format que Satori ne lit pas.
 * Aucun chiffre de gains, aucune promesse : seulement ce que fait l'outil.
 */
// Palette « blanc pur » (accent et fin du dégradé) ; noms gardés de la palette TikTok d'origine.
export const CYAN = '#F4F4F5';
export const PINK = '#A1A1AA';
export const GRADIENT = `linear-gradient(90deg, ${CYAN} 0%, ${PINK} 100%)`;

export const SHARE_FORMATS = {
  lien: { width: 1200, height: 630 },
  carre: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
} as const;
export type ShareFormat = keyof typeof SHARE_FORMATS;

export function ShareVisual({
  format = 'lien',
  eyebrow,
  title,
  accent,
  subtitle,
  badge,
  footer,
}: {
  format?: ShareFormat;
  eyebrow?: string;
  title: string;
  accent?: string;
  subtitle?: string;
  /** Mise en avant (un code, une offre). */
  badge?: string;
  footer?: string;
}) {
  const { width, height } = SHARE_FORMATS[format];
  const scale = width / 1200;
  const tall = height > width;
  // Bannière (1200 × 630) : moins de hauteur, tailles resserrées pour que tout tienne.
  const wide = width / height > 1.5;
  const pad = Math.round((wide ? 56 : 72) * scale);
  const titleSize = Math.round((tall ? 92 : wide ? 58 : 68) * scale);
  const subtitleSize = Math.round((tall ? 40 : wide ? 25 : 30) * scale);
  const badgeSize = Math.round((tall ? 52 : wide ? 32 : 40) * scale);
  const gap = Math.round((wide ? 16 : 22) * scale);
  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: pad,
        backgroundColor: '#000000',
        backgroundImage: `radial-gradient(circle at 12% 0%, rgba(37,244,238,0.22), transparent 45%), radial-gradient(circle at 95% ${tall ? '60%' : '100%'}, rgba(254,44,85,0.24), transparent 50%)`,
        color: '#FFFFFF',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(16 * scale) }}>
        <div
          style={{
            width: Math.round(44 * scale),
            height: Math.round(44 * scale),
            borderRadius: Math.round(12 * scale),
            backgroundImage: GRADIENT,
            transform: 'rotate(45deg) scale(0.72)',
          }}
        />
        <div style={{ display: 'flex', fontSize: Math.round(40 * scale), letterSpacing: -1 }}>
          <span style={{ color: '#FFFFFF' }}>{BRAND_SPLIT[0]}</span>
          <span style={{ color: PINK }}>{BRAND_SPLIT[1]}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {eyebrow ? (
          <div style={{ display: 'flex', fontSize: Math.round((wide ? 20 : 24) * scale), letterSpacing: 4, textTransform: 'uppercase', color: CYAN }}>{eyebrow}</div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: titleSize, lineHeight: 1.08, letterSpacing: -2 }}>
          <span>{title}</span>
          {accent ? <span style={{ color: CYAN }}>{accent}</span> : null}
        </div>
        <div style={{ display: 'flex', width: Math.round(220 * scale), height: Math.round(8 * scale), borderRadius: 8, backgroundImage: GRADIENT }} />
        {subtitle ? (
          <div style={{ display: 'flex', fontSize: subtitleSize, lineHeight: 1.35, color: '#B6B7BD', maxWidth: Math.round(980 * scale) }}>
            {subtitle}
          </div>
        ) : null}
        {badge ? (
          <div style={{ display: 'flex' }}>
            <div
              style={{
                display: 'flex',
                padding: `${Math.round(14 * scale)}px ${Math.round(26 * scale)}px`,
                borderRadius: Math.round(16 * scale),
                border: `${Math.max(2, Math.round(3 * scale))}px solid ${PINK}`,
                fontSize: badgeSize,
                letterSpacing: 2,
              }}
            >
              {badge}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: Math.round(24 * scale), color: '#8A8B91' }}>
        <span>{footer ?? 'TikTok Shop France · en français'}</span>
      </div>
    </div>
  );
}

/** Adresse sans « https:// » pour l'afficher sur un visuel. */
export const displayHost = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
