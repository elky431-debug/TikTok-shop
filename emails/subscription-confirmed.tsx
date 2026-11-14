/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Link, Text } from '@react-email/components';
import { formatEuros, formatLongDate } from '@/lib/utils';
import { colors, EmailLayout } from './layout';

/**
 * Confirmation de l'abonnement sur support durable (Code de la consommation, art. L221-13) : plan, prix, demande de
 * démarrage immédiat avec sa date et son texte exact, et rappel du droit de rétractation de 14 jours.
 */
export function SubscriptionConfirmedEmail({
  planName,
  priceCents,
  interval,
  monthlyEquivalentCents = null,
  consentText,
  consentAt,
  siteUrl,
}: {
  planName: string;
  priceCents: number;
  interval: 'month' | 'year';
  /** Annuel : prix mensuel équivalent, à titre de comparaison. */
  monthlyEquivalentCents?: number | null;
  consentText: string | null;
  consentAt: string | null;
  siteUrl: string;
}) {
  const period = interval === 'year' ? 'an' : 'mois';
  return (
    <EmailLayout preview={`Ton abonnement ${planName} a démarré`}>
      <Heading as="h1" style={{ margin: 0, fontSize: 22 }}>
        Ton abonnement {planName} a démarré
      </Heading>
      <Text style={{ margin: '12px 0 0', fontSize: 15, lineHeight: '22px' }}>
        Plan {planName}, {formatEuros(priceCents)} TTC par {period}
        {monthlyEquivalentCents ? ` (soit ${formatEuros(monthlyEquivalentCents)} par mois)` : ''}, sans engagement : tu résilies quand tu veux depuis ton
        compte, et l’accès reste ouvert jusqu’à la fin de la période payée.
      </Text>
      {consentText ? (
        <Text style={{ margin: '12px 0 0', fontSize: 14, lineHeight: '21px', color: colors.muted }}>
          Le {consentAt ? formatLongDate(consentAt.slice(0, 10)) : 'jour du paiement'}, tu as coché : « {consentText} »
        </Text>
      ) : null}
      <Text style={{ margin: '12px 0 0', fontSize: 14, lineHeight: '21px', color: colors.muted }}>
        Droit de rétractation : 14 jours à partir d’aujourd’hui. Pour l’exercer, écris-nous ou utilise le formulaire des{' '}
        <Link href={`${siteUrl}/cgv#retractation`} style={{ color: colors.ink }}>
          conditions générales de vente
        </Link>
        .
      </Text>
      <Button
        href={`${siteUrl}/app`}
        style={{
          marginTop: 20,
          backgroundColor: colors.rose,
          color: '#FFFFFF',
          borderRadius: 12,
          padding: '12px 20px',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        Ouvrir mon radar
      </Button>
    </EmailLayout>
  );
}

export default SubscriptionConfirmedEmail;
