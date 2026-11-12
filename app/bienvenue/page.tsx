import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { PageGlow } from '@/components/ui/page-glow';
import { ChoiceChip, Field, Input, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout } from '@/components/ui/surface';
import { REFERRAL_COOKIE } from '@/lib/auth/constants';
import { requireViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { NICHES } from '@/lib/niches';
import { AFFILIATE_THRESHOLD, FOLLOWER_RANGES, VIDEO_STYLES } from '@/lib/profile-rules';
import { formatInt } from '@/lib/utils';
import { saveOnboardingStep } from './actions';

export const metadata: Metadata = { title: 'Bienvenue' };
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  prenom: 'Indique ton prénom : on l’utilise dans ton récap du matin.',
  pseudo: 'Ton pseudo TikTok ne peut contenir que des lettres, des chiffres, des points et des tirets bas.',
  abonnes: 'Choisis la tranche qui correspond à ton compte aujourd’hui.',
  'niches-vide': 'Choisis au moins une niche.',
  'niches-trop': 'Trois niches maximum : mieux vaut viser juste.',
  style: 'Choisis ton style de vidéo.',
  code: 'Ce code ne correspond à aucun formateur ni parrain. Vérifie-le ou laisse le champ vide.',
};

const STEPS = ['Toi', 'Ton compte', 'Tes niches', 'Ton style'];

export default async function BienvenuePage({ searchParams }: { searchParams: { etape?: string; erreur?: string } }) {
  const { profile } = await requireViewer('/bienvenue');
  if (profile.onboarded_at) redirect('/app');

  const step = Math.min(4, Math.max(1, Number(searchParams.etape) || 1));
  const error = searchParams.erreur ? ERRORS[searchParams.erreur] : null;
  const pendingCode = cookies().get(REFERRAL_COOKIE)?.value ?? '';
  const coach = profile.coach_id ? await getRepo().getCoachById(profile.coach_id) : null;

  return (
    <div className="relative flex min-h-dvh flex-col">
      <PageGlow />
      <header className="relative flex items-center justify-between px-4 py-5 sm:px-8">
        <Logo href="/bienvenue" />
        <span className="num text-sm text-muted">
          Étape {step} sur {STEPS.length}
        </span>
      </header>

      <main id="contenu" className="relative mx-auto w-full max-w-lg flex-1 px-4 pb-16">
        <ol className="mb-8 grid grid-cols-4 gap-1.5" aria-label="Progression">
          {STEPS.map((label, i) => (
            <li key={label} className="min-w-0">
              <span
                className={`block h-1.5 rounded-full ${i < step ? 'bg-[image:var(--gradient)]' : 'bg-surface'}`}
                aria-hidden="true"
              />
              <span className={`mt-1.5 block truncate text-xs ${i + 1 === step ? 'font-semibold text-fg' : 'text-muted'}`}>
                {label}
                {i + 1 === step ? <span className="sr-only"> (étape en cours)</span> : null}
              </span>
            </li>
          ))}
        </ol>

        {error ? (
          <Callout tone="rose" className="mb-6" title="À corriger">
            {error}
          </Callout>
        ) : null}

        <form action={saveOnboardingStep} className="space-y-6">
          <input type="hidden" name="etape" value={step} />

          {step === 1 ? (
            <>
              <div>
                <h1 className="text-3xl">Salut ! On commence par toi.</h1>
                <p className="mt-2 text-muted">Deux infos pour personnaliser ton radar et tes scripts.</p>
              </div>
              <Field label="Ton prénom" htmlFor="prenom">
                <Input id="prenom" name="prenom" autoComplete="given-name" defaultValue={profile.first_name ?? ''} required maxLength={60} />
              </Field>
              <Field
                label="Ton pseudo TikTok (facultatif)"
                htmlFor="pseudo"
                hint="Juste pour l’affichage. On ne se connecte jamais à ton compte TikTok."
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">@</span>
                  <Input
                    id="pseudo"
                    name="pseudo"
                    className="pl-8"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    defaultValue={profile.tiktok_handle ?? ''}
                    maxLength={40}
                    aria-describedby="pseudo-aide"
                  />
                </div>
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div>
                <h1 className="text-3xl">Combien d’abonnés as-tu ?</h1>
                <p className="mt-2 text-muted">
                  Il faut environ {formatInt(AFFILIATE_THRESHOLD)} abonnés pour vendre en affiliation sur TikTok Shop France.
                </p>
              </div>
              <fieldset className="group space-y-2.5">
                <legend className="sr-only">Tranche d’abonnés</legend>
                {FOLLOWER_RANGES.map((range) => (
                  <ChoiceChip
                    key={range.id}
                    type="radio"
                    name="abonnes"
                    value={range.id}
                    defaultChecked={profile.follower_range === range.id}
                  >
                    {range.label}
                  </ChoiceChip>
                ))}
                <div className="hidden pt-2 group-has-[input[value='0-500']:checked]:block group-has-[input[value='500-1500']:checked]:block">
                  <Callout tone="cyan" title="Tu démarres en mode préparation">
                    Pas encore {formatInt(AFFILIATE_THRESHOLD)} abonnés ? Aucun souci. Tu vois déjà les produits qui montent et
                    tu t’entraînes avec les scripts. Tes vidéos font grandir ton compte, et le jour où tu passes le cap, tu
                    connais déjà les bons produits.
                  </Callout>
                </div>
              </fieldset>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div>
                <h1 className="text-3xl">Quelles niches t’intéressent ?</h1>
                <p className="mt-2 text-muted">De 1 à 3. Tu pourras les changer à tout moment.</p>
              </div>
              {profile.eligibility === 'preparation' ? (
                <Callout tone="cyan" title="Mode préparation">
                  Choisis les niches dans lesquelles tu veux poster dès maintenant : c’est là que ton audience se construit.
                </Callout>
              ) : null}
              <fieldset className="grid gap-2.5 sm:grid-cols-2">
                <legend className="sr-only">Niches</legend>
                {NICHES.map((niche) => (
                  <ChoiceChip key={niche.id} name="niches" value={niche.id} defaultChecked={profile.niches.includes(niche.id)}>
                    {niche.label}
                  </ChoiceChip>
                ))}
              </fieldset>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <div>
                <h1 className="text-3xl">Comment tu filmes ?</h1>
                <p className="mt-2 text-muted">Tes scripts seront écrits pour ce style, avec tes mots.</p>
              </div>
              <fieldset className="grid gap-2.5 sm:grid-cols-2">
                <legend className="sr-only">Style de vidéo</legend>
                {VIDEO_STYLES.map((style) => (
                  <ChoiceChip
                    key={style.id}
                    type="radio"
                    name="style"
                    value={style.id}
                    defaultChecked={profile.video_style === style.id}
                    description={style.hint}
                  >
                    {style.label}
                  </ChoiceChip>
                ))}
              </fieldset>
              <Field
                label="Une phrase que tu dirais dans une vidéo"
                htmlFor="phrase"
                hint="Exemple : « Les filles, faut que je vous montre un truc. » On s’en sert pour copier ton ton."
              >
                <Textarea
                  id="phrase"
                  name="phrase"
                  maxLength={240}
                  defaultValue={profile.example_phrase ?? ''}
                  aria-describedby="phrase-aide"
                />
              </Field>
              {coach ? (
                <Callout tone="gain" title={`Code formateur ${coach.promo_code} enregistré`}>
                  Tes 3 mois de Pro offerts démarrent dès que tu termines.
                </Callout>
              ) : profile.referred_by ? null : (
                <Field
                  label="Code formateur (facultatif)"
                  htmlFor="code"
                  hint="Ton formateur t’a donné un code ? Il t’offre 3 mois de Pro."
                >
                  <Input
                    id="code"
                    name="code"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    defaultValue={pendingCode}
                    maxLength={24}
                    className="uppercase"
                    aria-describedby="code-aide"
                  />
                </Field>
              )}
            </>
          ) : null}

          <div className="flex items-center gap-3 pt-2">
            {step > 1 ? (
              <Link
                href={`/bienvenue?etape=${step - 1}`}
                className="inline-flex h-[3.25rem] items-center rounded-full px-5 font-semibold text-muted hover:bg-surface hover:text-fg"
              >
                Retour
              </Link>
            ) : null}
            <SubmitButton size="lg" className="flex-1" pendingLabel="Enregistrement…">
              {step < 4 ? 'Continuer' : 'Voir mes produits du jour'}
            </SubmitButton>
          </div>
        </form>
      </main>
    </div>
  );
}
