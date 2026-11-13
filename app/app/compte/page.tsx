import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { ForgetDeviceForm } from '@/components/pwa/forget-device';
import { LinkButton } from '@/components/ui/button';
import { ChoiceChip, Field, Input, Label, Select, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { getRepo } from '@/lib/db';
import { getDisabledLifecycle } from '@/lib/lifecycle/preferences';
import { LIFECYCLE_INFO, LIFECYCLE_TYPES } from '@/lib/lifecycle/types';
import { NICHES } from '@/lib/niches';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { enabledRegions, REGION_IDS, REGIONS } from '@/lib/regions';
import { FOLLOWER_RANGES, VIDEO_STYLES } from '@/lib/profile-rules';
import { formatLongDate } from '@/lib/utils';
import { openPortalAction } from '../passer-pro/actions';
import { deleteAccountAction, updateEmailPreferencesAction, updatePreferencesAction, updateProfileAction, updateRegionAction } from './actions';

export const metadata: Metadata = { title: 'Mon compte' };

const MESSAGES: Record<string, { tone: 'gain' | 'rose'; text: string }> = {
  'ok=profil': { tone: 'gain', text: 'Profil enregistré.' },
  'ok=preferences': { tone: 'gain', text: 'Préférences enregistrées.' },
  'ok=pays': { tone: 'gain', text: 'Pays du catalogue enregistré.' },
  'ok=emails': { tone: 'gain', text: 'Choix des e-mails enregistré.' },
  'erreur=pays': { tone: 'rose', text: 'Le choix du pays est réservé au plan Pro+.' },
  'paiement=ok': { tone: 'gain', text: 'Paiement confirmé : ton plan est actif. Bienvenue !' },
  'resiliation=ok': { tone: 'gain', text: 'Abonnement résilié. Tu repasses en Gratuit.' },
  'erreur=prenom': { tone: 'rose', text: 'Indique ton prénom.' },
  'erreur=pseudo': { tone: 'rose', text: 'Ton pseudo TikTok ne peut contenir que des lettres, chiffres, points et tirets bas.' },
  'erreur=abonnes': { tone: 'rose', text: 'Choisis ta tranche d’abonnés.' },
  'erreur=niches': { tone: 'rose', text: 'Choisis entre 1 et 3 niches.' },
  'erreur=style': { tone: 'rose', text: 'Choisis ton style de vidéo.' },
  'erreur=confirmation': { tone: 'rose', text: 'Pour supprimer ton compte, tape SUPPRIMER en majuscules.' },
  'erreur=resiliation': { tone: 'rose', text: 'L’abonnement n’a pas pu être résilié, ton compte n’a pas été supprimé. Réessaie ou écris-nous.' },
  'erreur=paiement-indisponible': { tone: 'rose', text: 'Le paiement n’est pas encore activé sur ce site.' },
  'erreur=portail': { tone: 'rose', text: 'Le portail d’abonnement n’a pas pu s’ouvrir. Réessaie dans un instant.' },
};

export default async function ComptePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile, user } = await requireOnboardedViewer('/app/compte');
  const repo = getRepo();
  const [subscription, coach, disabledEmails] = await Promise.all([
    repo.getActiveSubscription(profile.id),
    profile.coach_id ? repo.getCoachById(profile.coach_id) : Promise.resolve(null),
    getDisabledLifecycle(profile.id),
  ]);
  const plan = getPlan(profile.plan);
  const message = Object.entries(searchParams)
    .map(([k, v]) => MESSAGES[`${k}=${v}`])
    .find(Boolean);
  const mode = billingMode();

  return (
    <div className="max-w-3xl">
      <PageHeader title="Mon compte" description={user.email} />
      {message ? (
        <Callout tone={message.tone} className="mb-6" title={message.text} />
      ) : null}

      <div className="space-y-6">
        {/* Abonnement */}
        <Card id="abonnement">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg">Mon abonnement</h2>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                Plan <Badge tone={isPaidPlan(profile.plan) ? 'ink' : 'neutral'}>{plan.name}</Badge>
                {subscription?.status === 'trialing' ? <Badge tone="gain">Essai offert</Badge> : null}
              </p>
              {subscription?.status === 'trialing' && subscription.trial_end ? (
                <p className="mt-2 text-sm">
                  Essai jusqu’au {formatLongDate(subscription.trial_end.slice(0, 10))}
                  {coach ? `, offert par ${coach.training_name}` : ''}. Sans moyen de paiement, tu repasses en Gratuit à cette date,
                  sans frais.
                </p>
              ) : subscription?.current_period_end ? (
                <p className="mt-2 text-sm">
                  {subscription.cancel_at_period_end ? 'Se termine' : 'Renouvellement'} le{' '}
                  {formatLongDate(subscription.current_period_end.slice(0, 10))}.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {subscription ? (
                <form action={openPortalAction}>
                  <SubmitButton variant="outline" pendingLabel="Ouverture…">
                    Gérer mon abonnement
                  </SubmitButton>
                </form>
              ) : (
                <LinkButton href="/app/passer-pro">Passer Pro</LinkButton>
              )}
            </div>
          </div>
          {subscription?.status === 'past_due' ? (
            <Callout
              tone="warn"
              className="mt-4"
              title="Ton dernier paiement n’est pas passé"
              action={
                <form action={openPortalAction}>
                  <input type="hidden" name="etape" value="carte" />
                  <SubmitButton pendingLabel="Ouverture…">Mettre à jour ma carte</SubmitButton>
                </form>
              }
            >
              Ton accès reste ouvert pendant les nouveaux essais de prélèvement. Mets à jour ta carte pour garder ton plan ;
              sans paiement, tu repasseras en Gratuit.
            </Callout>
          ) : null}
          {subscription ? (
            <p className="mt-3 text-xs text-muted">
              {mode === 'stripe'
                ? 'Moyen de paiement, factures et résiliation : tout se gère sur le portail sécurisé Stripe.'
                : 'Mode local : le portail est simulé.'}
            </p>
          ) : null}
        </Card>

        {/* Pays du catalogue */}
        <Card id="pays">
          <h2 className="text-lg">Pays du catalogue</h2>
          <p className="mt-1 text-sm text-muted">
            La France par défaut. Avec Pro+, ouvre aussi les produits d’Allemagne, d’Italie et d’Espagne (l’appli reste en
            français).
          </p>
          {plan.europe ? (
            <form action={updateRegionAction} className="mt-4 flex flex-wrap items-end gap-3">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pays du catalogue">
                {REGION_IDS.map((id) => (
                  <ChoiceChip key={id} type="radio" name="pays" value={id} defaultChecked={(profile.region ?? 'FR') === id}>
                    {REGIONS[id].label}
                    {enabledRegions().includes(id) ? '' : ' (bientôt)'}
                  </ChoiceChip>
                ))}
              </div>
              <SubmitButton variant="outline" size="sm" pendingLabel="Enregistrement…">
                Enregistrer le pays
              </SubmitButton>
            </form>
          ) : (
            <LinkButton href="/app/passer-pro" variant="outline" size="sm" className="mt-4">
              Passer Pro+
            </LinkButton>
          )}
        </Card>

        {/* Profil */}
        <Card id="profil">
          <h2 className="text-lg">Mon profil</h2>
          <form action={updateProfileAction} className="mt-4 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prénom" htmlFor="prenom">
                <Input id="prenom" name="prenom" defaultValue={profile.first_name ?? ''} required maxLength={60} autoComplete="given-name" />
              </Field>
              <Field label="Pseudo TikTok" htmlFor="pseudo">
                <Input id="pseudo" name="pseudo" defaultValue={profile.tiktok_handle ?? ''} maxLength={40} autoCapitalize="none" />
              </Field>
            </div>
            <Field label="Tranche d’abonnés" htmlFor="abonnes" hint="À partir de 1 500 abonnés, tu sors du mode préparation.">
              <Select id="abonnes" name="abonnes" defaultValue={profile.follower_range ?? '0-500'} aria-describedby="abonnes-aide">
                {FOLLOWER_RANGES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset id="niches" className="scroll-mt-20">
              <legend className="mb-2 text-sm font-semibold">Mes niches (1 à 3)</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {NICHES.map((n) => (
                  <ChoiceChip key={n.id} name="niches" value={n.id} defaultChecked={profile.niches.includes(n.id)}>
                    {n.label}
                  </ChoiceChip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Mon style de vidéo</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {VIDEO_STYLES.map((s) => (
                  <ChoiceChip key={s.id} type="radio" name="style" value={s.id} defaultChecked={profile.video_style === s.id}>
                    {s.label}
                  </ChoiceChip>
                ))}
              </div>
            </fieldset>
            <Field label="Une phrase que je dirais" htmlFor="phrase">
              <Textarea id="phrase" name="phrase" defaultValue={profile.example_phrase ?? ''} maxLength={240} />
            </Field>
            <SubmitButton pendingLabel="Enregistrement…">Enregistrer mon profil</SubmitButton>
          </form>
        </Card>

        {/* Préférences */}
        <Card id="preferences">
          <h2 className="text-lg">Préférences</h2>
          <form action={updatePreferencesAction} className="mt-4 space-y-5">
            <div>
              <Label htmlFor="theme">Apparence</Label>
              <Select id="theme" name="theme" defaultValue={profile.theme === 'light' ? 'light' : 'dark'} className="sm:max-w-xs">
                <option value="dark">Sombre (par défaut)</option>
                <option value="light">Clair</option>
              </Select>
            </div>
            {coach ? (
              <ChoiceChip
                name="partage"
                value="1"
                defaultChecked={profile.share_email_with_coach}
                description={`${coach.training_name} voit déjà ton prénom, ton plan et ta progression, jamais ton e-mail sans ton accord.`}
              >
                Partager mon e-mail avec mon formateur
              </ChoiceChip>
            ) : null}
            <SubmitButton variant="outline" pendingLabel="Enregistrement…">
              Enregistrer mes préférences
            </SubmitButton>
          </form>
          <p className="mt-4 text-sm text-muted">
            Récap du matin (heure, e-mail, Discord) :{' '}
            <Link href="/app/recap" className="font-semibold text-fg underline underline-offset-2">
              réglages du récap
            </Link>
            . Ton lien de parrainage :{' '}
            <Link href="/app/parrainage" className="font-semibold text-fg underline underline-offset-2">
              parrainage
            </Link>
            .
          </p>
        </Card>

        {/* E-mails de cycle de vie */}
        <Card id="emails" className="scroll-mt-20">
          <h2 className="text-lg">E-mails</h2>
          <p className="mt-1 text-sm text-muted">
            Chacun part une seule fois, au bon moment. Décoche ceux que tu ne veux pas recevoir. Les récaps se règlent sur la{' '}
            <Link href="/app/recap#reglages" className="font-semibold text-fg underline underline-offset-2">
              page Récap
            </Link>
            .
          </p>
          <form action={updateEmailPreferencesAction} className="mt-4 space-y-4">
            {(['conseils', 'abonnement'] as const).map((group) => (
              <fieldset key={group} className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">{group === 'conseils' ? 'Conseils et nouvelles' : 'Ton abonnement'}</legend>
                {LIFECYCLE_TYPES.filter((t) => LIFECYCLE_INFO[t].group === group).map((type) => (
                  <ChoiceChip
                    key={type}
                    name="emails"
                    value={type}
                    defaultChecked={!disabledEmails.has(type)}
                    description={LIFECYCLE_INFO[type].description}
                  >
                    {LIFECYCLE_INFO[type].label}
                  </ChoiceChip>
                ))}
              </fieldset>
            ))}
            <p className="text-xs text-muted">
              Les e-mails indispensables (lien de connexion, échec d’un prélèvement, reçus de paiement) partent toujours.
            </p>
            <SubmitButton variant="outline" pendingLabel="Enregistrement…">
              Enregistrer mes e-mails
            </SubmitButton>
          </form>
        </Card>

        {/* Données personnelles */}
        <Card id="donnees" className="scroll-mt-20">
          <h2 className="text-lg">Mes données</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Télécharge tout ce que nous gardons sur toi, dans un fichier JSON : profil, scripts, produits suivis, récaps, abonnement,
            parrainages, gains, plans de publication, notifications et réglages.
          </p>
          <a
            href="/app/compte/export"
            download
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-6 text-sm font-semibold hover:bg-surface"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Télécharger mes données
          </a>
        </Card>

        {/* Suppression */}
        <section id="suppression" className="rounded-2xl border border-rose-ink/30 p-4 sm:p-5">
          <h2 className="text-lg">Supprimer mon compte</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Tout est effacé : profil, scripts, produits suivis, récaps, gains, plans de publication, notifications, réglages, liaison
            Discord et notifications de tes appareils. Ton abonnement est résilié tout de suite et les e-mails déjà programmés sont
            annulés. C’est définitif : télécharge tes données avant si tu veux les garder.
          </p>
          <ForgetDeviceForm action={deleteAccountAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Tape SUPPRIMER pour confirmer" htmlFor="confirmation" className="sm:w-64">
              <Input id="confirmation" name="confirmation" autoComplete="off" autoCapitalize="characters" />
            </Field>
            <SubmitButton variant="danger" pendingLabel="Suppression…">
              Supprimer mon compte
            </SubmitButton>
          </ForgetDeviceForm>
        </section>

        <form action="/auth/deconnexion" method="post" className="lg:hidden">
          <button type="submit" className="text-sm font-semibold text-muted underline underline-offset-2">
            Me déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}
