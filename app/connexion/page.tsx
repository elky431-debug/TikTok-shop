import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { PageGlow } from '@/components/ui/page-glow';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/surface';
import { getSessionUser } from '@/lib/auth/session';
import { safeNextPath } from '@/lib/auth/redirects';
import { isLocalMode } from '@/lib/env';
import { COACH_FIRST_MONTH_DISCOUNT } from '@/lib/plans';
import { describeCode } from '@/lib/referral';
import { signInWithGoogle } from './actions';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Connexion' };
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  lien: 'Ce lien de connexion est incomplet. Connecte-toi avec ton mot de passe, ou redemande un lien.',
  'lien-expire': 'Ce lien a expiré ou a déjà servi. Redemande un lien ci-dessous.',
  session: "La connexion n'a pas abouti. Redemande un lien ci-dessous.",
  google: "La connexion avec Google n'a pas abouti. Réessaie ou utilise ton e-mail.",
  'google-local': 'Google nécessite Supabase (mode local actif). Utilise le lien magique.',
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: { suite?: string; erreur?: string; code?: string; mode?: string };
}) {
  const suite = safeNextPath(searchParams.suite);
  const user = await getSessionUser();
  if (user) redirect(suite);

  const localMode = isLocalMode();
  const code = searchParams.code ? await describeCode(searchParams.code) : null;
  const error = searchParams.erreur ? ERRORS[searchParams.erreur] ?? ERRORS.session : null;

  return (
    <div className="relative flex min-h-dvh flex-col">
      <PageGlow />
      <header className="relative px-4 py-5 sm:px-8">
        <Logo />
      </header>
      <main id="contenu" className="relative flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold">
            Connecte-<span className="text-gradient">toi</span>
          </h1>
          <p className="mt-2 text-muted">Ou crée ton compte en 10 secondes, puis choisis ton abonnement.</p>

          <div className="mt-6 space-y-4">
            {error ? (
              <Callout tone="rose" title="Connexion impossible">
                {error}
              </Callout>
            ) : null}
            {code?.kind === 'coach' ? (
              <Callout tone="cyan" title={`Code formateur ${code.code} appliqué`}>
                Avec {code.coach.training_name} : −{Math.round(COACH_FIRST_MONTH_DISCOUNT * 100)} % sur ton premier mois d’abonnement
                mensuel, avec son code promo à saisir au paiement.
              </Callout>
            ) : code?.kind === 'parrain' ? (
              <Callout tone="cyan" title="Invitation enregistrée">
                {code.referrer.first_name ?? 'Un membre'} t'a invité. Ton compte sera relié à son lien.
              </Callout>
            ) : null}

            <LoginForm suite={suite} localMode={localMode} initialMode={searchParams.mode === 'connexion' ? 'connexion' : 'inscription'} />

            <div className="flex items-center gap-3 text-sm text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              ou
              <span className="h-px flex-1 bg-line" />
            </div>

            <form action={signInWithGoogle}>
              <input type="hidden" name="suite" value={suite} />
              <Button type="submit" variant="outline" size="lg" className="w-full" disabled={localMode}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z" />
                </svg>
                Continuer avec Google
              </Button>
              {localMode ? (
                <p className="mt-2 text-center text-xs text-muted">Google sera disponible une fois Supabase configuré.</p>
              ) : null}
            </form>
          </div>

          <p className="mt-8 text-xs leading-relaxed text-muted">
            En continuant, tu acceptes les{' '}
            <Link href="/cgv" className="underline underline-offset-2 hover:text-fg">
              conditions générales
            </Link>{' '}
            et la{' '}
            <Link href="/confidentialite" className="underline underline-offset-2 hover:text-fg">
              politique de confidentialité
            </Link>
            . On ne se connecte jamais à ton compte TikTok.
          </p>
        </div>
      </main>
    </div>
  );
}
