import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { PageGlow } from '@/components/ui/page-glow';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout } from '@/components/ui/surface';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe';
import { unsubscribeAction } from './actions';

export const metadata: Metadata = { title: 'Désinscription du récap', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Page du lien « Ne plus recevoir le récap » des e-mails : un clic sur le bouton, sans connexion. */
export default function DesinscriptionPage({ searchParams }: { searchParams: { u?: string; t?: string; etat?: string } }) {
  const valid = verifyUnsubscribeToken(searchParams.u ?? '', searchParams.t ?? '');
  return (
    <div className="relative flex min-h-dvh flex-col">
      <PageGlow />
      <header className="relative px-4 py-5 sm:px-8">
        <Logo href="/" />
      </header>
      <main id="contenu" className="relative mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-10">
        <h1 className="text-3xl">Récap du matin par e-mail</h1>
        {searchParams.etat === 'fait' ? (
          <Callout tone="gain" className="mt-6" title="C’est fait : tu ne recevras plus le récap par e-mail">
            Tu peux le réactiver quand tu veux depuis{' '}
            <Link href="/app/recap" className="font-semibold underline">
              la page Récap
            </Link>{' '}
            de l’appli.
          </Callout>
        ) : searchParams.etat === 'lien-invalide' || !valid ? (
          <Callout tone="rose" className="mt-6" title="Ce lien de désinscription n’est pas valide">
            Ouvre le lien depuis le dernier e-mail reçu, ou coupe le récap depuis{' '}
            <Link href="/app/recap" className="font-semibold underline">
              la page Récap
            </Link>
            .
          </Callout>
        ) : (
          <form action={unsubscribeAction} className="mt-6 space-y-4">
            <p className="text-muted">Un clic et tu ne reçois plus le récap du matin par e-mail. Ton compte reste actif.</p>
            <input type="hidden" name="u" value={searchParams.u} />
            <input type="hidden" name="t" value={searchParams.t} />
            <SubmitButton size="lg" className="w-full" pendingLabel="Désinscription…">
              Ne plus recevoir le récap
            </SubmitButton>
          </form>
        )}
      </main>
    </div>
  );
}
