/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Text } from '@react-email/components';
import { colors, EmailLayout } from './layout';

/** Rappel du jour : les vidéos prévues dans le plan de publication. Rien n'est publié à ta place. */
export function PublicationReminderEmail({ items, siteUrl }: { items: Array<{ product: string; n: number; total: number }>; siteUrl: string }) {
  return (
    <EmailLayout preview={`Aujourd’hui : ${items.length} vidéo${items.length > 1 ? 's' : ''} à poster`}>
      <Heading as="h1" style={{ margin: 0, fontSize: 22 }}>
        Tes vidéos du jour
      </Heading>
      {items.map((item) => (
        <Text key={`${item.product}-${item.n}`} style={{ margin: '10px 0 0', fontSize: 15 }}>
          Vidéo n°{item.n}/{item.total} : {item.product}
        </Text>
      ))}
      <Button
        href={`${siteUrl}/app/plan`}
        style={{ marginTop: 20, backgroundColor: colors.rose, color: '#FFFFFF', borderRadius: 12, padding: '12px 20px', fontSize: 15, fontWeight: 600 }}
      >
        Ouvrir mon plan
      </Button>
    </EmailLayout>
  );
}

export default PublicationReminderEmail;
