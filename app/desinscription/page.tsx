import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { PageGlow } from '@/components/ui/page-glow';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout } from '@/components/ui/surface';
import { UNSUBSCRIBE_COPY } from '@/lib/lifecycle/unsubscribe';
import { parseUnsubscribeList, verifyUnsubscribeToken } from '@/lib/unsubscribe';
import { unsubscribeAction } from './actions';

export const metadata: Metadata = { title: 'Désinscription', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Page du lien « Ne plus recevoir… » des e-mails : un clic sur le bouton, sans connexion. Jamais de désinscription sur
 * un simple affichage (les antivirus de messagerie ouvrent les liens) : seul le bouton (POST) agit.
 */
export default function DesinscriptionPage({ searchParams }: { searchParams: { u?: string; t?: string; l?: string; etat?: string } }) {
  const list = parseUnsubscribeList(searchParams.l);
  const copy = UNSUBSCRIBE_COPY[list ?? 'matin'];
  const valid = list !== null && verifyUnsubscribeToken(searchParams.u ?? '', searchParams.t ?? '', list);
  return (
    <div className="relative flex min-h-dvh flex-col">
      <PageGlow />
      <header className="relative px-4 py-5 sm:px-8">
        <Logo href="/" />
      </header>
      <main id="contenu" className="relative mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-10">
        <h1 className="text-3xl">{copy.title}</h1>
        {searchParams.etat === 'fait' ? (
          <Callout tone="gain" className="mt-6" title={copy.done}>
            Tu peux changer d’avis quand tu veux depuis{' '}
            <Link href={copy.whereHref} className="font-semibold underline">
              {copy.where}
            </Link>
            .
          </Callout>
        ) : searchParams.etat === 'lien-invalide' || !valid ? (
          <Callout tone="rose" className="mt-6" title="Ce lien de désinscription n’est pas valide">
            Ouvre le lien depuis le dernier e-mail reçu, ou règle tes e-mails depuis{' '}
            <Link href={copy.whereHref} className="font-semibold underline">
              {copy.where}
            </Link>
            .
          </Callout>
        ) : (
          <form action={unsubscribeAction} className="mt-6 space-y-4">
            <p className="text-muted">Un clic et c’est coupé. Ton compte reste actif, et les autres e-mails ne changent pas.</p>
            <input type="hidden" name="u" value={searchParams.u} />
            <input type="hidden" name="t" value={searchParams.t} />
            <input type="hidden" name="l" value={list ?? 'matin'} />
            <SubmitButton size="lg" className="w-full" pendingLabel="Désinscription…">
              {copy.button}
            </SubmitButton>
          </form>
        )}
      </main>
    </div>
  );
}
