/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Heading, Text } from '@react-email/components';
import { BRAND } from '@/lib/brand';
import { EmailLayout } from './layout';

/** E-mail de test : prouve que l'envoi par Resend marche (npm run test:integration, bouton de l'admin). */
export function TestEmail({ siteUrl, sentAt }: { siteUrl: string; sentAt: string }) {
  return (
    <EmailLayout preview={`Test d’envoi ${BRAND} : les e-mails partent bien`}>
      <Heading as="h1" style={{ margin: 0, fontSize: 22 }}>
        Les e-mails partent bien
      </Heading>
      <Text style={{ margin: '12px 0 0', fontSize: 15 }}>
        Cet e-mail de test a été envoyé le {sentAt} (heure UTC) depuis {siteUrl}. Tu peux l’ignorer.
      </Text>
    </EmailLayout>
  );
}

export default TestEmail;
