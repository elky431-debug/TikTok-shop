/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Link, Section, Text } from '@react-email/components';
import type { DigestNotice, PersonalDigestContent } from '@/lib/digest/personal';
import { nicheShort } from '@/lib/niches';
import { TREND_LABELS } from '@/lib/score';
import { formatEuros, formatGrowth, formatLongDate } from '@/lib/utils';
import { colors, EmailLayout } from './layout';

export interface MorningDigestProps {
  content: PersonalDigestContent;
  siteUrl: string;
  /** Lien de désinscription en un clic, sans connexion (absent dans l'aperçu de l'appli). */
  unsubscribeUrl?: string;
}

function Notices({ title, items, total, siteUrl, tone }: { title: string; items: DigestNotice[]; total: number; siteUrl: string; tone: string }) {
  if (!items.length) return null;
  return (
    <Section style={{ marginTop: 20 }}>
      <Text style={{ margin: 0, fontSize: 13, fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title}
      </Text>
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
 * Récap du matin : le défi du jour, les meilleurs produits de ses niches, les alertes et produits suivis en baisse depuis
 * la veille, une accroche prête, un bouton vers l'appli.
 */
export function MorningDigestEmail({ content, siteUrl, unsubscribeUrl }: MorningDigestProps) {
  const top = content.products[0];
  const preview = top ? `N°1 aujourd’hui : ${top.name} (${formatGrowth(top.growth_7d)} en 7 jours)` : 'Tes produits du jour sont prêts';
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

      <Section style={{ marginTop: 20 }}>
        {content.products.map((p, i) => (
          <Section
            key={p.id}
            style={{
              borderTop: i === 0 ? 'none' : '1px solid #E1E1E5',
              padding: '14px 0',
            }}
          >
            <Text style={{ margin: 0, fontSize: 12, color: colors.muted }}>
              N°{i + 1} · {nicheShort(p.niche)}
              {p.score !== null ? ` · score ${p.score}/100` : ''}
            </Text>
            <Link href={`${siteUrl}/app/produit/${p.id}`} style={{ color: colors.ink, textDecoration: 'none' }}>
              <Text style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 600, lineHeight: '22px' }}>{p.name}</Text>
            </Link>
            <Text style={{ margin: '4px 0 0', fontSize: 14, lineHeight: '20px' }}>
              {formatEuros(p.price_cents)} ·{' '}
              <span style={{ color: colors.gain, fontWeight: 600 }}>{formatEuros(p.commission_cents)} par vente</span> ·{' '}
              <span style={{ color: p.trend === 'baisse' ? colors.rose : colors.cyan }}>
                {TREND_LABELS[p.trend]} {formatGrowth(p.growth_7d)}
              </span>
            </Text>
          </Section>
        ))}
      </Section>

      {content.locked_count > 0 ? (
        <Text style={{ fontSize: 14, color: colors.muted, margin: '4px 0 0' }}>
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

      {content.hook ? (
        <Section style={{ backgroundColor: '#F1F1F2', borderRadius: 12, padding: '14px 16px', marginTop: 20 }}>
          <Text style={{ margin: 0, fontSize: 12, color: colors.muted }}>Ton accroche du jour pour « {content.hook.product_name} »</Text>
          <Text style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 600, lineHeight: '24px' }}>« {content.hook.text} »</Text>
        </Section>
      ) : null}

      <Section style={{ marginTop: 24 }}>
        <Button
          href={`${siteUrl}/app`}
          style={{
            backgroundColor: colors.rose,
            color: '#FFFFFF',
            borderRadius: 999,
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
