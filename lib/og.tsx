/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { BRAND } from '@/lib/brand';
import { LOGO_DATA_URI, LOGO_RATIO } from '@/lib/brand-images';

/**
 * Visuels de partage générés par `ImageResponse` (next/og, rendu par Satori) : fond blanc comme le site, logo définitif
 * en image (tel quel : ses lettres noires ne se liraient pas sur fond noir), dégradé cyan → rose. Satori n'accepte que
 * des boîtes flex et un sous-ensemble du CSS ; la police est celle fournie par next/og (Noto Sans) : Sora n'existe
 * qu'en woff2, format que Satori ne lit pas. Aucun chiffre de gains, aucune promesse : seulement ce que fait l'outil.
 */
export const CYAN = '#00777A';
export const PINK = '#C8103F';
export const INK = '#161823';
export const MUTED = '#5F6068';
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
        backgroundColor: '#FFFFFF',
        backgroundImage: `radial-gradient(circle at 12% 0%, rgba(37,244,238,0.16), transparent 45%), radial-gradient(circle at 95% ${tall ? '60%' : '100%'}, rgba(254,44,85,0.12), transparent 50%)`,
        color: INK,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori n'accepte que <img> */}
        <img src={LOGO_DATA_URI} alt={BRAND} height={Math.round(52 * scale)} width={Math.round(52 * scale * LOGO_RATIO)} />
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
          <div style={{ display: 'flex', fontSize: subtitleSize, lineHeight: 1.35, color: MUTED, maxWidth: Math.round(980 * scale) }}>
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
                color: INK,
                fontSize: badgeSize,
                letterSpacing: 2,
              }}
            >
              {badge}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: Math.round(24 * scale), color: MUTED }}>
        <span>{footer ?? 'TikTok Shop France · en français'}</span>
      </div>
    </div>
  );
}

/** Adresse sans « https:// » pour l'afficher sur un visuel. */
export const displayHost = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
