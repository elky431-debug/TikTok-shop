/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Text } from '@react-email/components';
import { colors, EmailLayout } from './layout';

/** E-mail générique d'une notification (alerte, rappel…), avec un seul bouton. */
export function NotificationEmail({ title, body, url, action }: { title: string; body: string; url: string; action: string }) {
  return (
    <EmailLayout preview={title}>
      <Heading as="h1" style={{ margin: 0, fontSize: 22 }}>
        {title}
      </Heading>
      <Text style={{ margin: '12px 0 0', fontSize: 15, lineHeight: '22px', whiteSpace: 'pre-line' }}>{body}</Text>
      <Button href={url} style={{ marginTop: 20, backgroundColor: colors.rose, color: '#FFFFFF', borderRadius: 12, padding: '12px 20px', fontSize: 15, fontWeight: 600 }}>
        {action}
      </Button>
    </EmailLayout>
  );
}

export default NotificationEmail;
