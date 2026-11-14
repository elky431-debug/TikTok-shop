/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Link, Section, Text } from '@react-email/components';
import type { WeeklyRecapContent } from '@/lib/digest/weekly';
import { formatDayMonth, formatEuros, plural } from '@/lib/utils';
import { colors, EmailLayout } from './layout';

const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export interface WeeklyRecapProps {
  content: WeeklyRecapContent;
  siteUrl: string;
  /** Lien de désinscription en un clic (absent dans l'aperçu de l'appli). */
  unsubscribeUrl?: string;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <td style={{ width: '33%', verticalAlign: 'top', padding: '0 6px 0 0' }}>
      <Text style={{ margin: 0, fontSize: 12, color: colors.muted }}>{label}</Text>
      <Text style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, lineHeight: '30px' }}>{value}</Text>
      {hint ? <Text style={{ margin: '2px 0 0', fontSize: 12, color: colors.muted }}>{hint}</Text> : null}
    </td>
  );
}

/** Récap du dimanche : vidéos de la semaine, série, gains saisis, objectif, meilleur produit. */
export function WeeklyRecapEmail({ content, siteUrl, unsubscribeUrl }: WeeklyRecapProps) {
  const diff = content.videos.total - content.videos.previous_week;
  return (
    <EmailLayout
      preview={`${plural(content.videos.total, 'vidéo postée', 'vidéos postées')} cette semaine`}
      footer={
        <>
          Tu reçois ce récap le dimanche parce qu’il est activé.{' '}
          <Link href={`${siteUrl}/app/recap#dimanche`} style={{ color: colors.muted, textDecoration: 'underline' }}>
            Changer l’heure
          </Link>
          {' · '}
          <Link href={unsubscribeUrl ?? `${siteUrl}/app/recap#dimanche`} style={{ color: colors.muted, textDecoration: 'underline' }}>
            Ne plus recevoir le récap du dimanche
          </Link>
          .
        </>
      }
    >
      <Text style={{ margin: 0, fontSize: 14, color: colors.muted }}>
        Semaine du {formatDayMonth(content.week_start)} au {formatDayMonth(content.week_end)}
      </Text>
      <Heading as="h1" style={{ margin: '4px 0 0', fontSize: 26, lineHeight: '32px', letterSpacing: '-0.02em' }}>
        {content.first_name ? `${content.first_name}, ta` : 'Ta'} semaine en chiffres
      </Heading>

      <Section style={{ marginTop: 20 }}>
        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
          <tbody>
            <tr>
              <Stat
                label="Vidéos postées"
                value={String(content.videos.total)}
                hint={diff === 0 ? 'comme la semaine dernière' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} par rapport à la semaine dernière`}
              />
              <Stat
                label="Série en cours"
                value={plural(content.streak.current, 'jour')}
                hint={content.streak.best > content.streak.current ? `record : ${plural(content.streak.best, 'jour')}` : undefined}
              />
              <Stat
                label="Gains saisis"
                value={content.gains ? formatEuros(content.gains.cents) : '—'}
                hint={content.gains ? plural(content.gains.entries, 'ligne') : 'avec le plan Pro'}
              />
            </tr>
          </tbody>
        </table>
      </Section>

      <Section style={{ marginTop: 16 }}>
        <table cellPadding={0} cellSpacing={0} role="presentation">
          <tbody>
            <tr>
              {content.videos.by_day.map((d, i) => (
                <td key={d.date} style={{ padding: '0 4px 0 0', textAlign: 'center' }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      lineHeight: '30px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      backgroundColor: d.count > 0 ? colors.cyan : colors.surface,
                      color: d.count > 0 ? '#FFFFFF' : colors.muted,
                    }}
                  >
                    {d.count > 0 ? d.count : '·'}
                  </div>
                  <Text style={{ margin: '2px 0 0', fontSize: 11, color: colors.muted }}>{DAY_LETTERS[i]}</Text>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </Section>

      {content.best_product ? (
        <Section style={{ backgroundColor: colors.surface, borderRadius: 12, padding: '14px 16px', marginTop: 20 }}>
          <Text style={{ margin: 0, fontSize: 12, color: colors.muted }}>Ton meilleur produit de la semaine</Text>
          <Text style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 600, lineHeight: '24px' }}>{content.best_product.name}</Text>
          <Text style={{ margin: '2px 0 0', fontSize: 14 }}>{content.best_product.detail}</Text>
        </Section>
      ) : null}

      {content.goals.length ? (
        <Section style={{ marginTop: 20 }}>
          <Text style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Objectif 20 vidéos par produit</Text>
          {content.goals.map((g) => (
            <Text key={g.product_id} style={{ margin: '6px 0 0', fontSize: 14 }}>
              {g.name} : <strong>{g.posted}</strong> / {g.goal}
              {g.posted >= g.goal ? ' · objectif atteint' : ` · encore ${g.goal - g.posted}`}
            </Text>
          ))}
        </Section>
      ) : null}

      {content.next_week_planned !== null ? (
        <Text style={{ margin: '16px 0 0', fontSize: 14 }}>
          La semaine prochaine : {plural(content.next_week_planned, 'vidéo prévue', 'vidéos prévues')} dans ton plan.
        </Text>
      ) : null}

      <Section style={{ marginTop: 24 }}>
        <Button
          href={`${siteUrl}/app`}
          style={{ backgroundColor: colors.rose, color: '#FFFFFF', borderRadius: 12, padding: '14px 24px', fontWeight: 600, fontSize: 15 }}
        >
          Voir ma semaine
        </Button>
      </Section>
      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 16 }}>
        Les vidéos viennent de « Mes produits » et de ton plan, les gains de ce que tu as saisi : rien n’est estimé.
      </Text>
    </EmailLayout>
  );
}

export default WeeklyRecapEmail;
