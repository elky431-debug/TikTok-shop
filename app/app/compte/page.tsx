import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { ForgetDeviceForm } from '@/components/pwa/forget-device';
import { LinkButton } from '@/components/ui/button';
import { ChoiceChip, Field, Input, Label, Select, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, PageHeader } from '@/components/ui/surface';
import { THEME_COOKIE } from '@/lib/auth/constants';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { getRepo } from '@/lib/db';
import { getDisabledLifecycle } from '@/lib/lifecycle/preferences';
import { LIFECYCLE_INFO, LIFECYCLE_TYPES } from '@/lib/lifecycle/types';
import { NICHES } from '@/lib/niches';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { enabledRegions, REGION_IDS, REGIONS } from '@/lib/regions';
import { AFFILIATE_STATUSES, EXPERIENCE_LEVELS, FOLLOWER_RANGES, isVideoStyle, VIDEO_STYLES, VIDEOS_PER_WEEK } from '@/lib/profile-rules';
import { getEarningsGoal } from '@/lib/v2/earnings-store';
import { formatLongDate } from '@/lib/utils';
import { openPortalAction } from '../passer-pro/actions';
import { deleteAccountAction, updateEmailPreferencesAction, updatePreferencesAction, updateProfileAction, updateRegionAction } from './actions';

export const metadata: Metadata = { title: 'Mon compte' };

const MESSAGES: Record<string, { tone: 'gain' | 'rose'; text: string }> = {
  'ok=profil': { tone: 'gain', text: 'Profil enregistré.' },
  'ok=preferences': { tone: 'gain', text: 'Préférences enregistrées.' },
  'ok=pays': { tone: 'gain', text: 'Pays du catalogue enregistré.' },
  'ok=emails': { tone: 'gain', text: 'Choix des e-mails enregistré.' },
  'erreur=pays': { tone: 'rose', text: 'Le choix du pays est réservé au plan Elite.' },
  'paiement=ok': { tone: 'gain', text: 'Paiement confirmé : ton plan est actif. Bienvenue !' },
  'resiliation=ok': { tone: 'gain', text: 'Abonnement résilié. L’appli se ferme à la fin de la période payée.' },
  'erreur=prenom': { tone: 'rose', text: 'Indique ton prénom.' },
  'erreur=pseudo': { tone: 'rose', text: 'Ton pseudo TikTok ne peut contenir que des lettres, chiffres, points et tirets bas.' },
  'erreur=abonnes': { tone: 'rose', text: 'Choisis ta tranche d’abonnés.' },
  'erreur=niches': { tone: 'rose', text: 'Choisis entre 1 et 3 niches.' },
  'erreur=style': { tone: 'rose', text: 'Choisis au moins un style de vidéo.' },
  'erreur=objectif': { tone: 'rose', text: 'Ton objectif doit être un montant entre 1 € et 100 000 €, ou vide.' },
  'erreur=confirmation': { tone: 'rose', text: 'Pour supprimer ton compte, tape SUPPRIMER en majuscules.' },
  'erreur=resiliation': { tone: 'rose', text: 'L’abonnement n’a pas pu être résilié, ton compte n’a pas été supprimé. Réessaie ou écris-nous.' },
  'erreur=paiement-indisponible': { tone: 'rose', text: 'Le paiement n’est pas encore activé sur ce site.' },
  'erreur=portail': { tone: 'rose', text: 'Le portail d’abonnement n’a pas pu s’ouvrir. Réessaie dans un instant.' },
};

export default async function ComptePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile, user } = await requireOnboardedViewer('/app/compte', { abonnement: false });
  const repo = getRepo();
  const [subscription, coach, disabledEmails, goal] = await Promise.all([
    repo.getActiveSubscription(profile.id),
    profile.coach_id ? repo.getCoachById(profile.coach_id) : Promise.resolve(null),
    getDisabledLifecycle(profile.id),
    getEarningsGoal(repo, profile.id),
  ]);
  // Une ancienne tranche n'est plus proposée : la liste demande de rechoisir.
  const currentRange = FOLLOWER_RANGES.some((r) => r.id === profile.follower_range) ? (profile.follower_range as string) : '';
  const currentStyles = (profile.video_styles?.length ? profile.video_styles : profile.video_style ? [profile.video_style] : []).filter(isVideoStyle);
  const plan = getPlan(profile.plan);
  const message = Object.entries(searchParams)
    .map(([k, v]) => MESSAGES[`${k}=${v}`])
    .find(Boolean);
  const mode = billingMode();

  return (
    <div>
      <PageHeader eyebrow="Compte" title="Mon compte" description={user.email} />
      {message ? (
        <Callout tone={message.tone} className="mb-6" title={message.text} />
      ) : null}

      {/* Grand écran : abonnement et profil à gauche, préférences et données à droite. */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
      <div className="min-w-0 space-y-6">
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
                  {coach ? `, offert par ${coach.training_name}` : ''}. Sans moyen de paiement, l’appli se ferme à cette date, sans
                  frais.
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
                <LinkButton href={plan.access ? '/app/passer-pro' : '/abonnement'}>{plan.access ? 'Changer de plan' : 'Choisir mon abonnement'}</LinkButton>
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
              sans paiement, l’appli se fermera.
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
          <p className="mt-1 text-sm text-muted">La France ; l’Allemagne, l’Italie et l’Espagne avec Elite.</p>
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
              Passer à Elite
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Taille de mon compte" htmlFor="abonnes" hint="Sous 1 500 abonnés, tu es en mode préparation.">
                <Select id="abonnes" name="abonnes" defaultValue={currentRange} aria-describedby="abonnes-aide" required>
                  {currentRange ? null : <option value="">Choisis</option>}
                  {FOLLOWER_RANGES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Déjà affilié TikTok Shop ?" htmlFor="affilie">
                <Select id="affilie" name="affilie" defaultValue={profile.affiliate_status ?? ''}>
                  <option value="">Pas répondu</option>
                  {AFFILIATE_STATUSES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Mon niveau" htmlFor="niveau">
                <Select id="niveau" name="niveau" defaultValue={profile.experience_level ?? ''}>
                  <option value="">Pas répondu</option>
                  {EXPERIENCE_LEVELS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Vidéos par semaine" htmlFor="rythme" hint="Ton objectif de la semaine et le rythme de ton plan.">
                <Select id="rythme" name="rythme" defaultValue={profile.videos_per_week ?? ''} aria-describedby="rythme-aide">
                  <option value="">Pas répondu</option>
                  {VIDEOS_PER_WEEK.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
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
              <legend className="mb-2 text-sm font-semibold">Mes styles de vidéo (un ou plusieurs)</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {VIDEO_STYLES.map((s) => (
                  <ChoiceChip key={s.id} name="styles" value={s.id} defaultChecked={currentStyles.includes(s.id)}>
                    {s.label}
                  </ChoiceChip>
                ))}
              </div>
            </fieldset>
            <Field
              label="Mon objectif de gains par mois (facultatif)"
              htmlFor="objectif"
              hint="Un repère personnel, pas une promesse. Laisse vide pour ne pas en avoir."
              className="scroll-mt-20"
            >
              <div id="objectifs" className="relative max-w-xs scroll-mt-20">
                <Input id="objectif" name="objectif" inputMode="numeric" defaultValue={goal.cents ? String(Math.round(goal.cents / 100)) : ''} className="pr-12" aria-describedby="objectif-aide" />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">€</span>
              </div>
            </Field>
            <Field label="Une phrase que je dirais" htmlFor="phrase">
              <Textarea id="phrase" name="phrase" defaultValue={profile.example_phrase ?? ''} maxLength={240} />
            </Field>
            <SubmitButton pendingLabel="Enregistrement…">Enregistrer mon profil</SubmitButton>
          </form>
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        {/* Préférences */}
        <Card id="preferences">
          <h2 className="text-lg">Préférences</h2>
          <form action={updatePreferencesAction} className="mt-4 space-y-5">
            <div>
              <Label htmlFor="theme">Apparence</Label>
              <Select id="theme" name="theme" defaultValue={cookies().get(THEME_COOKIE)?.value === 'dark' ? 'dark' : 'light'} className="sm:max-w-xs">
                <option value="light">Clair (par défaut)</option>
                <option value="dark">Noir</option>
              </Select>
            </div>
            {coach ? (
              <ChoiceChip
                name="partage"
                value="1"
                defaultChecked={profile.share_email_with_coach}
                description={`${coach.training_name} ne voit que des chiffres d’ensemble sur ses élèves, jamais ton e-mail sans ton accord. Ton détail (plan, progression) se partage dans « Mon formateur ».`}
              >
                Partager mon e-mail avec mon formateur
              </ChoiceChip>
            ) : null}
            {coach ? (
              <Link href="/app/consentement-formateur" className="text-sm font-semibold text-cyan-ink hover:underline">
                Gérer ce que voit mon formateur
              </Link>
            ) : null}
            <SubmitButton variant="outline" pendingLabel="Enregistrement…">
              Enregistrer mes préférences
            </SubmitButton>
          </form>
          <p className="mt-4 text-sm text-muted">
            Récap du matin et bilan du dimanche :{' '}
            <Link href="/app/recap" className="font-semibold text-fg underline underline-offset-2">
              réglages du récap
            </Link>
            .
          </p>
        </Card>

        {/* E-mails de cycle de vie */}
        <Card id="emails" className="scroll-mt-20">
          <h2 className="text-lg">E-mails</h2>
          <p className="mt-1 text-sm text-muted">
            Décoche ceux que tu ne veux pas recevoir. Les récaps se règlent sur la{' '}
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
          <p className="mt-1 max-w-prose text-sm text-muted">Tout ce que nous gardons sur toi, dans un fichier JSON.</p>
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
            Tout est effacé et ton abonnement est résilié tout de suite. C’est définitif : télécharge tes données avant.
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
    </div>
  );
}
