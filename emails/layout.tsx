/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';
import { BRAND } from '@/lib/brand';

export const colors = {
  ink: '#161823',
  paper: '#FFFFFF',
  surface: '#F1F1F2',
  muted: '#5F6068',
  // Palette « blanc pur » sur fond clair : boutons et accents en noir, chiffres positifs en cyan foncé.
  rose: '#161823',
  cyan: '#161823',
  gain: '#00777A',
};

export const font =
  "'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function EmailLayout({ preview, children, footer }: { preview: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.surface, margin: 0, padding: '24px 0', fontFamily: font, color: colors.ink }}>
        <Container style={{ backgroundColor: colors.paper, maxWidth: 560, borderRadius: 16, padding: '28px 24px' }}>
          <Text style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            <span style={{ color: colors.ink }}>◆</span> {BRAND}
          </Text>
          <Section style={{ marginTop: 20 }}>{children}</Section>
          <Hr style={{ borderColor: '#E1E1E5', margin: '28px 0 16px' }} />
          <Text style={{ fontSize: 12, lineHeight: '18px', color: colors.muted, margin: 0 }}>
            {footer ?? `${BRAND} t’aide à choisir tes produits TikTok Shop. Aucune connexion à ton compte TikTok.`}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
