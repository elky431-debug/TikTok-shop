/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Link, Section, Text } from '@react-email/components';
import type { LifecycleType } from '@/lib/lifecycle/types';
import { BRAND } from '@/lib/brand';
import { formatEuros, formatLongDate } from '@/lib/utils';
import { colors, EmailLayout } from './layout';

/**
 * E-mails de cycle de vie (un modèle par type). Ton direct, au tutoiement ; aucun chiffre de gains, aucune promesse :
 * ce que fait l'outil et la prochaine action à faire.
 */
export interface LifecycleEmailProps {
  type: LifecycleType;
  firstName: string | null;
  siteUrl: string;
  /** Lien de désinscription en un clic (famille de l'e-mail). */
  unsubscribeUrl?: string;
  /** fin_essai */
  trialEnd?: string | null;
  coachName?: string | null;
  /** reactivation : produits du moment dans ses niches (jamais de produits fictifs présentés comme réels). */
  products?: Array<{ id: string; name: string; commission_cents: number }>;
  /** Pas encore d'abonnement : l'e-mail renvoie vers le choix du plan. */
  freePlan?: boolean;
}

const p = { margin: '12px 0 0', fontSize: 15, lineHeight: '22px' } as const;

/** « Léa, tu n’as pas… » ou « Tu n’as pas… » sans prénom. */
function opening(firstName: string | null, rest: string): string {
  return firstName ? `${firstName}, ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1);
}

export function lifecycleSubject(type: LifecycleType, props: Pick<LifecycleEmailProps, 'firstName' | 'trialEnd'>): string {
  switch (type) {
    case 'bienvenue':
      return props.firstName ? `Bienvenue sur ${BRAND}, ${props.firstName}` : `Bienvenue sur ${BRAND}`;
    case 'astuce_j1':
      return 'Astuce : 20 vidéos sur le même produit';
    case 'rappel_j3':
      return 'Ton premier script t’attend';
    case 'reactivation':
      return 'Tes produits du jour continuent d’arriver';
    case 'fin_essai':
      return props.trialEnd ? `Ton essai se termine le ${formatLongDate(props.trialEnd.slice(0, 10))}` : 'Ton essai se termine bientôt';
    case 'relance_paiement':
      return 'Ton paiement est toujours en attente';
  }
}

function Cta({ href, children }: { href: string; children: string }) {
  return (
    <Section style={{ marginTop: 22 }}>
      <Button href={href} style={{ backgroundColor: colors.rose, color: '#FFFFFF', borderRadius: 12, padding: '13px 22px', fontSize: 15, fontWeight: 600 }}>
        {children}
      </Button>
    </Section>
  );
}

function Body(props: LifecycleEmailProps) {
  const { siteUrl } = props;
  switch (props.type) {
    case 'bienvenue':
      return (
        <>
          <Heading as="h1" style={{ margin: 0, fontSize: 24 }}>
            {props.firstName ? `Bienvenue, ${props.firstName} !` : 'Bienvenue !'}
          </Heading>
          <Text style={p}>Voici comment {BRAND} t’aide, chaque jour :</Text>
          <Text style={p}>
            <strong>1. Le matin</strong>, ton récap : les produits qui montent dans tes niches, avec leur commission par vente.
          </Text>
          <Text style={p}>
            <strong>2. Au studio</strong>, 10 accroches et 3 scripts écrits pour ton style, en quelques secondes.
          </Text>
          <Text style={p}>
            <strong>3. Dans « Mes produits »</strong>, tu suis tes vidéos vers l’objectif de 20 par produit.
          </Text>
          {props.freePlan ? (
            <>
              <Text style={p}>Dernière étape : choisis ton abonnement pour ouvrir ton radar. Sans engagement.</Text>
              <Cta href={`${siteUrl}/abonnement`}>Choisir mon abonnement</Cta>
            </>
          ) : (
            <Cta href={`${siteUrl}/app`}>Voir mes produits du jour</Cta>
          )}
        </>
      );
    case 'astuce_j1':
      return (
        <>
          <Heading as="h1" style={{ margin: 0, fontSize: 24 }}>
            Une astuce pour bien démarrer
          </Heading>
          <Text style={p}>
            {opening(
              props.firstName,
              'les affiliés qui avancent ne changent pas de produit tous les jours : ils en choisissent un qui monte et publient beaucoup dessus. Vise 20 vidéos sur le même produit, avec des angles différents.',
            )}
          </Text>
          <Text style={p}>Aujourd’hui : ajoute un produit du radar à « Mes produits », écris 3 scripts dessus, et tourne-les à la suite.</Text>
          <Cta href={`${siteUrl}/app`}>Choisir mon produit</Cta>
        </>
      );
    case 'rappel_j3':
      return (
        <>
          <Heading as="h1" style={{ margin: 0, fontSize: 24 }}>
            Ton premier script t’attend
          </Heading>
          <Text style={p}>
            {opening(
              props.firstName,
              'tu n’as pas encore écrit de script. Choisis un de tes produits du jour : le studio t’écrit 10 accroches et 3 scripts prêts à tourner, dans ton style.',
            )}
          </Text>
          <Cta href={`${siteUrl}/app/studio`}>Écrire mon premier script</Cta>
        </>
      );
    case 'reactivation':
      return (
        <>
          <Heading as="h1" style={{ margin: 0, fontSize: 24 }}>
            Ça bouge dans tes niches
          </Heading>
          <Text style={p}>
            {opening(props.firstName, 'ça fait un moment qu’on ne t’a pas vu. Le radar continue de se mettre à jour chaque nuit.')}
          </Text>
          {props.products?.length ? (
            <Section style={{ marginTop: 12 }}>
              <Text style={{ margin: 0, fontSize: 13, color: colors.muted }}>En tête de tes niches aujourd’hui :</Text>
              {props.products.map((product) => (
                <Text key={product.id} style={{ margin: '6px 0 0', fontSize: 15 }}>
                  <Link href={`${siteUrl}/app/produit/${product.id}`} style={{ color: colors.ink, fontWeight: 600 }}>
                    {product.name}
                  </Link>{' '}
                  <span style={{ color: colors.gain }}>· {formatEuros(product.commission_cents)} par vente</span>
                </Text>
              ))}
            </Section>
          ) : null}
          <Cta href={`${siteUrl}/app`}>Voir mes produits du jour</Cta>
        </>
      );
    case 'fin_essai':
      return (
        <>
          <Heading as="h1" style={{ margin: 0, fontSize: 24 }}>
            Ton essai se termine bientôt
          </Heading>
          <Text style={p}>
            {opening(
              props.firstName,
              `ton essai${props.coachName ? `, offert par ${props.coachName},` : ''} se termine ${props.trialEnd ? `le ${formatLongDate(props.trialEnd.slice(0, 10))}` : 'dans quelques jours'}.`,
            )}
          </Text>
          <Text style={p}>
            Sans abonnement, l’appli se ferme à cette date, sans frais. Pour garder ton radar et tes scripts, choisis ton abonnement :
            ton code formateur te donne −20 % sur le premier mois.
          </Text>
          <Cta href={`${siteUrl}/abonnement`}>Choisir mon abonnement</Cta>
        </>
      );
    case 'relance_paiement':
      return (
        <>
          <Heading as="h1" style={{ margin: 0, fontSize: 24 }}>
            Ton paiement est toujours en attente
          </Heading>
          <Text style={p}>
            Ta banque refuse encore le prélèvement de ton abonnement. Ton accès reste ouvert pendant les nouveaux essais, mais s’ils échouent
            tous, l’appli se fermera.
          </Text>
          <Text style={p}>Le plus simple : mets à jour ta carte, l’abonnement reprend tout seul.</Text>
          <Cta href={`${siteUrl}/app/compte?paiement=echec#abonnement`}>Mettre à jour ma carte</Cta>
        </>
      );
  }
}

export function LifecycleEmail(props: LifecycleEmailProps) {
  const subject = lifecycleSubject(props.type, props);
  return (
    <EmailLayout
      preview={subject}
      footer={
        <>
          Tu peux choisir les e-mails que tu reçois dans{' '}
          <Link href={`${props.siteUrl}/app/compte#emails`} style={{ color: colors.muted, textDecoration: 'underline' }}>
            ton compte
          </Link>
          {props.unsubscribeUrl ? (
            <>
              {' · '}
              <Link href={props.unsubscribeUrl} style={{ color: colors.muted, textDecoration: 'underline' }}>
                Ne plus recevoir ces e-mails
              </Link>
            </>
          ) : null}
          .
        </>
      }
    >
      <Body {...props} />
    </EmailLayout>
  );
}

export default LifecycleEmail;
