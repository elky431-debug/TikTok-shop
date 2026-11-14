/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Column, Heading, Img, Link, Row, Section, Text } from '@react-email/components';
import type { DigestProduct } from '@/lib/db/types';
import type { DigestNotice, PersonalDigestContent } from '@/lib/digest/personal';
import type { NicheId } from '@/lib/niches';
import { nicheShort } from '@/lib/niches';
import { shortLabel } from '@/lib/product-name';
import { TREND_LABELS } from '@/lib/score';
import { formatEuros, formatGrowth, formatLongDate } from '@/lib/utils';
import { colors, EmailLayout } from './layout';

export interface MorningDigestProps {
  content: PersonalDigestContent;
  siteUrl: string;
  /** Lien de désinscription en un clic, sans connexion (absent dans l'aperçu de l'appli). */
  unsubscribeUrl?: string;
}

/** Vignette de repli quand le produit n'a pas de vraie photo : les messageries n'affichent pas le SVG des fiches. */
const NICHE_TILE: Record<NicheId, { bg: string; emoji: string }> = {
  beaute: { bg: '#FFE4EA', emoji: '💄' },
  maison: { bg: '#E7F3EE', emoji: '🏠' },
  mode: { bg: '#EFE9F8', emoji: '👗' },
  tech: { bg: '#E3FBFA', emoji: '🎧' },
  sport: { bg: '#EAF7E4', emoji: '🏋️' },
  animaux: { bg: '#FFF1E2', emoji: '🐾' },
  bebe: { bg: '#E8F2FF', emoji: '🍼' },
};

/** Photo utilisable dans un e-mail : adresse absolue, image matricielle (pas le visuel SVG de repli). */
export function emailImageUrl(url: string | null | undefined): string | null {
  if (!url || !/^https:\/\//.test(url)) return null;
  if (/\/api\/produit-image\//.test(url) || /\.svg(\?|$)/i.test(url)) return null;
  return url;
}

function trendColor(trend: DigestProduct['trend']): string {
  if (trend === 'baisse') return colors.rose;
  if (trend === 'stable') return colors.muted;
  return colors.cyan;
}

function ProductCard({ product, rank, siteUrl }: { product: DigestProduct; rank: number; siteUrl: string }) {
  const href = `${siteUrl}/app/produit/${product.id}`;
  const image = emailImageUrl(product.image_url);
  const tile = NICHE_TILE[product.niche] ?? NICHE_TILE.maison;
  const name = shortLabel(product.name);
  return (
    <Section style={{ border: '1px solid #E1E1E5', borderRadius: 14, padding: 12, marginTop: 10 }}>
      <Row>
        <Column style={{ width: 64, verticalAlign: 'middle' }}>
          <Link href={href}>
            {image ? (
              <Img src={image} width={56} height={56} alt="" style={{ display: 'block', borderRadius: 10, objectFit: 'cover' }} />
            ) : (
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 10,
                  backgroundColor: tile.bg,
                  textAlign: 'center',
                  lineHeight: '56px',
                  fontSize: 26,
                }}
              >
                {tile.emoji}
              </div>
            )}
          </Link>
        </Column>
        <Column style={{ verticalAlign: 'middle', paddingLeft: 4 }}>
          <Text style={{ margin: 0, fontSize: 12, color: colors.muted }}>
            N°{rank} · {nicheShort(product.niche)}
          </Text>
          <Link href={href} style={{ color: colors.ink, textDecoration: 'none' }}>
            <Text style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, lineHeight: '21px' }}>{name}</Text>
          </Link>
          <Text style={{ margin: '4px 0 0', fontSize: 13, lineHeight: '18px' }}>
            <span style={{ color: colors.gain, fontWeight: 700 }}>{formatEuros(product.commission_cents)} par vente</span>
            <span style={{ color: colors.muted }}> · </span>
            <span style={{ color: trendColor(product.trend), fontWeight: 600 }}>
              {TREND_LABELS[product.trend]} {formatGrowth(product.growth_7d)}
            </span>
          </Text>
        </Column>
        {product.score !== null ? (
          <Column style={{ width: 64, verticalAlign: 'middle', textAlign: 'right' }}>
            <Text style={{ margin: 0, fontSize: 26, fontWeight: 800, lineHeight: '28px', color: colors.ink }}>{product.score}</Text>
            <Text style={{ margin: 0, fontSize: 11, color: colors.muted }}>score /100</Text>
          </Column>
        ) : null}
      </Row>
    </Section>
  );
}

function Notices({ title, items, total, siteUrl, tone }: { title: string; items: DigestNotice[]; total: number; siteUrl: string; tone: string }) {
  if (!items.length) return null;
  return (
    <Section style={{ marginTop: 20 }}>
      <Text style={{ margin: 0, fontSize: 13, fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</Text>
      {items.map((n, i) => (
        <Text key={i} style={{ margin: '8px 0 0', fontSize: 14, lineHeight: '20px' }}>
          <Link href={`${siteUrl}${n.path}`} style={{ color: colors.ink, fontWeight: 600 }}>
            {n.title}
          </Link>
          {n.body ? <span style={{ color: colors.muted }}> · {n.body}</span> : null}
        </Text>
      ))}
      {total > items.length ? (
        <Text style={{ margin: '6px 0 0', fontSize: 13, color: colors.muted }}>+ {total - items.length} autres dans tes notifications.</Text>
      ) : null}
    </Section>
  );
}

/**
 * Récap du matin : le défi du jour, puis les 5 produits à vendre aujourd'hui (photo, nom court, score, commission par
 * vente, tendance), les alertes et produits suivis en baisse depuis la veille, et un bouton vers l'appli.
 */
export function MorningDigestEmail({ content, siteUrl, unsubscribeUrl }: MorningDigestProps) {
  const top = content.products[0];
  const preview = top ? `N°1 aujourd’hui : ${shortLabel(top.name)} (${formatGrowth(top.growth_7d)} en 7 jours)` : 'Tes produits du jour sont prêts';
  return (
    <EmailLayout
      preview={preview}
      footer={
        <>
          Tu reçois ce récap parce que tu l’as activé.{' '}
          <Link href={`${siteUrl}/app/recap`} style={{ color: colors.muted, textDecoration: 'underline' }}>
            Changer l’heure
          </Link>
          {' · '}
          <Link href={unsubscribeUrl ?? `${siteUrl}/app/recap`} style={{ color: colors.muted, textDecoration: 'underline' }}>
            Ne plus recevoir le récap
          </Link>
          .
        </>
      }
    >
      <Text style={{ margin: 0, fontSize: 14, color: colors.muted }}>{formatLongDate(content.date)}</Text>
      <Heading as="h1" style={{ margin: '4px 0 0', fontSize: 26, lineHeight: '32px', letterSpacing: '-0.02em' }}>
        {content.first_name ? `${content.first_name}, voici` : 'Voici'} tes produits du jour
      </Heading>
      {content.demo ? (
        <Text style={{ margin: '8px 0 0', fontSize: 14, color: colors.muted }}>
          Produits fictifs : démonstration en attendant le branchement des vraies données.
        </Text>
      ) : null}

      {content.personal?.challenge ? (
        <Section style={{ border: `2px solid ${colors.cyan}`, borderRadius: 12, padding: '12px 16px', marginTop: 18 }}>
          <Text style={{ margin: 0, fontSize: 12, fontWeight: 700, color: colors.cyan, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Défi du jour
          </Text>
          <Link href={`${siteUrl}${content.personal.challenge.path}`} style={{ color: colors.ink, textDecoration: 'none' }}>
            <Text style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, lineHeight: '24px' }}>{content.personal.challenge.text}</Text>
          </Link>
          <Text style={{ margin: '2px 0 0', fontSize: 13, color: colors.muted }}>{content.personal.challenge.detail}</Text>
        </Section>
      ) : null}

      <Section style={{ marginTop: 18 }}>
        <Text style={{ margin: 0, fontSize: 12, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {content.products.length > 1 ? `Les ${content.products.length} produits à vendre aujourd’hui` : 'Le produit à vendre aujourd’hui'}
        </Text>
        {content.products.map((p, i) => (
          <ProductCard key={p.id} product={p} rank={i + 1} siteUrl={siteUrl} />
        ))}
      </Section>

      {content.locked_count > 0 ? (
        <Text style={{ fontSize: 14, color: colors.muted, margin: '10px 0 0' }}>
          + {content.locked_count} autres produits dans tes niches avec le plan Pro.
        </Text>
      ) : null}

      <Notices
        title="Tes alertes depuis hier"
        items={content.personal?.alerts ?? []}
        total={content.personal?.alerts_total ?? 0}
        siteUrl={siteUrl}
        tone={colors.cyan}
      />
      <Notices
        title="Produits suivis en baisse"
        items={content.personal?.drops ?? []}
        total={content.personal?.drops_total ?? 0}
        siteUrl={siteUrl}
        tone={colors.rose}
      />

      <Section style={{ marginTop: 24 }}>
        <Button
          href={`${siteUrl}/app/radar`}
          style={{
            backgroundColor: colors.rose,
            color: '#FFFFFF',
            borderRadius: 12,
            padding: '14px 24px',
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Ouvrir mon radar
        </Button>
      </Section>
      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 16 }}>
        Rappel : signale toujours la collaboration commerciale dans tes vidéos (#publicité).
      </Text>
    </EmailLayout>
  );
}

export default MorningDigestEmail;
