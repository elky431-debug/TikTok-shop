import { Heading, Text } from '@react-email/components';
import type { CoachApplication } from '@/lib/db/types';
import { colors, EmailLayout } from './layout';

/** Notification au fondateur : nouvelle demande de partenariat formateur. */
export function CoachApplicationEmail({ application, siteUrl }: { application: CoachApplication; siteUrl: string }) {
  const rows: Array<[string, string]> = [
    ['Nom', application.name],
    ['E-mail', application.email],
    ['Formation', application.training_name],
    ['Taille de la communauté', application.audience_size || 'non précisée'],
  ];
  return (
    <EmailLayout preview={`Nouvelle demande formateur : ${application.training_name}`}>
      <Heading as="h1" style={{ margin: 0, fontSize: 22 }}>
        Nouvelle demande de partenariat
      </Heading>
      {rows.map(([label, value]) => (
        <Text key={label} style={{ margin: '10px 0 0', fontSize: 15 }}>
          <span style={{ color: colors.muted }}>{label} : </span>
          {value}
        </Text>
      ))}
      {application.message ? (
        <Text style={{ margin: '16px 0 0', fontSize: 15, whiteSpace: 'pre-line' }}>{application.message}</Text>
      ) : null}
      <Text style={{ margin: '20px 0 0', fontSize: 14 }}>
        Pour activer ce formateur : {siteUrl}/admin (onglet formateurs).
      </Text>
    </EmailLayout>
  );
}

export default CoachApplicationEmail;
