/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Text } from '@react-email/components';
import { formatEuros, formatLongDate } from '@/lib/utils';
import { colors, EmailLayout } from './layout';

/** Prévient l'abonné qu'un prélèvement n'est pas passé, avec le chemin exact pour régler le problème. */
export function PaymentFailedEmail({
  planName,
  amountCents,
  nextAttemptAt,
  siteUrl,
}: {
  planName: string;
  amountCents: number;
  nextAttemptAt: string | null;
  siteUrl: string;
}) {
  return (
    <EmailLayout preview={`Ton paiement de ${formatEuros(amountCents)} n’est pas passé`}>
      <Heading as="h1" style={{ margin: 0, fontSize: 22 }}>
        Ton paiement n’est pas passé
      </Heading>
      <Text style={{ margin: '12px 0 0', fontSize: 15, lineHeight: '22px' }}>
        Le prélèvement de {formatEuros(amountCents)} pour ton plan {planName} a été refusé par ta banque. Ton accès reste
        ouvert pour l’instant.
      </Text>
      <Text style={{ margin: '12px 0 0', fontSize: 15, lineHeight: '22px' }}>
        {nextAttemptAt
          ? `Nouvel essai automatique le ${formatLongDate(nextAttemptAt.slice(0, 10))}. Mets à jour ta carte avant pour éviter de repasser en Gratuit.`
          : 'Plus aucun essai automatique n’est prévu : mets à jour ta carte pour garder ton plan, sinon tu repasseras en Gratuit.'}
      </Text>
      <Button
        href={`${siteUrl}/app/compte?paiement=echec#abonnement`}
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
        Mettre à jour ma carte
      </Button>
    </EmailLayout>
  );
}

export default PaymentFailedEmail;
