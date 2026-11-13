import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
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
import { WelcomeShell } from './welcome-shell';

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

/**
 * Bienvenue, partie profil : 3 écrans courts (toi et ton compte, tes niches, ton style). Ensuite, le « moment waouh » :
 * tes 3 produits du jour (/bienvenue/produits), ton premier script, puis l'offre Pro.
 */
export default async function BienvenuePage({ searchParams }: { searchParams: { etape?: string; erreur?: string } }) {
  const { profile } = await requireViewer('/bienvenue');
  if (profile.onboarded_at) redirect('/app');

  const step = Math.min(3, Math.max(1, Number(searchParams.etape) || 1));
  const error = searchParams.erreur ? ERRORS[searchParams.erreur] : null;
  const pendingCode = cookies().get(REFERRAL_COOKIE)?.value ?? '';
  const coach = profile.coach_id ? await getRepo().getCoachById(profile.coach_id) : null;

  return (
    <WelcomeShell step={step}>
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
              <h1 className="text-3xl">Salut ! Deux minutes et tu as tes produits du jour.</h1>
              <p className="mt-2 text-muted">On commence par toi.</p>
            </div>
            <Field label="Ton prénom" htmlFor="prenom">
              <Input id="prenom" name="prenom" autoComplete="given-name" defaultValue={profile.first_name ?? ''} required maxLength={60} />
            </Field>
            <Field label="Ton pseudo TikTok (facultatif)" htmlFor="pseudo" hint="Juste pour l’affichage. On ne se connecte jamais à ton compte TikTok.">
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
            <fieldset className="group space-y-2.5">
              <legend className="mb-1 text-sm font-semibold">Combien d’abonnés as-tu ?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {FOLLOWER_RANGES.map((range) => (
                  <ChoiceChip key={range.id} type="radio" name="abonnes" value={range.id} defaultChecked={profile.follower_range === range.id}>
                    {range.label}
                  </ChoiceChip>
                ))}
              </div>
              <div className="hidden pt-2 group-has-[input[value='0-500']:checked]:block group-has-[input[value='500-1500']:checked]:block">
                <Callout tone="cyan" title="Tu démarres en mode préparation">
                  Il faut environ {formatInt(AFFILIATE_THRESHOLD)} abonnés pour vendre en affiliation. En attendant, tu vois déjà les
                  produits qui montent et tu t’entraînes avec les scripts.
                </Callout>
              </div>
            </fieldset>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div>
              <h1 className="text-3xl">Quelles niches t’intéressent ?</h1>
              <p className="mt-2 text-muted">De 1 à 3. Ton radar ne gardera que ces produits-là.</p>
            </div>
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

        {step === 3 ? (
          <>
            <div>
              <h1 className="text-3xl">Comment tu filmes ?</h1>
              <p className="mt-2 text-muted">Ton premier script sera écrit pour ce style, juste après.</p>
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
              label="Une phrase que tu dirais dans une vidéo (facultatif)"
              htmlFor="phrase"
              hint="Exemple : « Les filles, faut que je vous montre un truc. » On s’en sert pour copier ton ton."
            >
              <Textarea id="phrase" name="phrase" maxLength={240} defaultValue={profile.example_phrase ?? ''} aria-describedby="phrase-aide" />
            </Field>
            {coach ? (
              <Callout tone="gain" title={`Code formateur ${coach.promo_code} enregistré`}>
                Tes 3 mois de Pro offerts démarrent dès que tu valides.
              </Callout>
            ) : profile.referred_by ? null : (
              <Field label="Code formateur (facultatif)" htmlFor="code" hint="Ton formateur t’a donné un code ? Il t’offre 3 mois de Pro.">
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
              className="inline-flex h-12 items-center rounded-xl px-5 font-semibold text-muted hover:bg-surface hover:text-fg"
            >
              Retour
            </Link>
          ) : null}
          <SubmitButton size="lg" className="flex-1" pendingLabel="Enregistrement…">
            {step < 3 ? 'Continuer' : 'Voir mes 3 produits du jour'}
          </SubmitButton>
        </div>
      </form>
    </WelcomeShell>
  );
}
