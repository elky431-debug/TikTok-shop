import type { Metadata } from 'next';
import { Rocket } from 'lucide-react';
import Link from 'next/link';
import { STAGE_TONES } from '@/components/manager/stage-tones';
import { ProductImage } from '@/components/product/product-image';
import { LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, EmptyState, PageHeader, ProgressBar, SectionTitle } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { cn, formatLongDate } from '@/lib/utils';
import { launchHref, LAUNCH_STEPS, STEP_LABELS, stepIndex } from '@/lib/v2/launch';
import { loadLaunchCards } from '@/lib/v2/launch-view';
import { STAGE_LABELS } from '@/lib/v2/manager';
import { reopenLaunchAction } from './actions';

export const metadata: Metadata = { title: 'Lancer un produit' };

const MESSAGES: Record<string, { tone: 'gain' | 'neutral' | 'warn'; text: string }> = {
  'ferme=termine': { tone: 'gain', text: 'Lancement terminé : il est rangé dans l’historique.' },
  'ferme=abandonne': { tone: 'neutral', text: 'Lancement abandonné : il est rangé dans l’historique.' },
  'lancement=limite': { tone: 'warn', text: 'Tu suis déjà le nombre de produits de ton plan : termine ou abandonne un lancement pour en ouvrir un autre.' },
};

export default async function LaunchHomePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const { open, history } = await loadLaunchCards(getRepo(), profile.id);
  const message = Object.entries(searchParams)
    .map(([k, v]) => MESSAGES[`${k}=${v}`])
    .find(Boolean);

  return (
    <div>
      <PageHeader
        eyebrow="Accueil"
        title="Lancer un produit"
        description="Du choix du produit à tes vidéos en ligne, étape par étape : chaque étape validée met ton dashboard à jour."
        actions={
          <LinkButton href="/app/lancer/nouveau" size="lg">
            <Rocket className="h-5 w-5" aria-hidden="true" />
            Lancer un nouveau produit
          </LinkButton>
        }
      />
      {message ? <Callout tone={message.tone} className="mb-6" title={message.text} /> : null}

      <SectionTitle>{open.length ? `En cours (${open.length})` : 'En cours'}</SectionTitle>
      {open.length ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {open.map((card) => (
            <li key={card.id}>
              <Link
                href={launchHref(card.id)}
                className="feature-card group flex h-full flex-col gap-4 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan"
              >
                <div className="flex items-start gap-3">
                  <ProductImage src={card.image} fallback={card.fallback} alt="" className="h-16 w-16 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">{card.name}</p>
                    <p className="mt-1 text-sm text-muted">
                      Étape {stepIndex(card.step) + 1} sur {LAUNCH_STEPS.length} · <span className="font-semibold text-fg">{STEP_LABELS[card.step]}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-auto space-y-2">
                  <ProgressBar value={card.progress} max={100} label={`Avancement du lancement de ${card.name}`} />
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className={cn('rounded-full px-2.5 py-0.5 font-semibold', STAGE_TONES[card.stage])}>{STAGE_LABELS[card.stage]}</span>
                    <span className="num text-muted">
                      {card.posted} / {card.goal} vidéos
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/app/lancer/nouveau"
              className="flex h-full min-h-[10rem] flex-col items-start justify-end gap-2 rounded-2xl border border-dashed border-line-strong p-4 text-sm font-semibold text-muted transition-colors hover:border-cyan-ink/50 hover:text-fg"
            >
              <Rocket className="h-5 w-5 text-rose-ink" aria-hidden="true" />
              Lancer un nouveau produit
            </Link>
          </li>
        </ul>
      ) : (
        <EmptyState
          icon={<Rocket className="h-5 w-5" />}
          title="Aucun lancement en cours"
          action={
            <LinkButton href="/app/lancer/nouveau" size="lg">
              Lancer un nouveau produit
            </LinkButton>
          }
        >
          Choisis un produit, demande ton échantillon, écris tes scripts, planifie, tourne et publie : tout le parcours est ici.
        </EmptyState>
      )}

      {history.length ? (
        <section id="historique" className="mt-12 scroll-mt-20" aria-labelledby="historique-titre">
          <SectionTitle id="historique-titre">Historique</SectionTitle>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {history.map((card) => (
              <li key={card.id} className="flex items-center gap-3 rounded-2xl border border-line bg-raised p-3">
                <ProductImage src={card.image} fallback={card.fallback} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <Link href={launchHref(card.id)} className="line-clamp-1 font-semibold hover:underline hover:underline-offset-4">
                    {card.name}
                  </Link>
                  <p className="text-xs text-muted">
                    {card.state === 'termine' ? 'Terminé' : 'Abandonné'}
                    {card.endedAt ? ` le ${formatLongDate(card.endedAt)}` : ''} · {card.posted} vidéo{card.posted > 1 ? 's' : ''} en ligne
                  </p>
                </div>
                <form action={reopenLaunchAction}>
                  <input type="hidden" name="id" value={card.id} />
                  <SubmitButton variant="outline" size="sm" pendingLabel="Reprise…">
                    Reprendre
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
