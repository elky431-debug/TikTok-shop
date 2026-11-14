import { Link2, Send } from 'lucide-react';
import { publishVideoAction } from '@/app/app/lancer/actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, ProgressBar } from '@/components/ui/surface';
import { getRepo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { parseTikTokLink, playerUrl } from '@/lib/tiktok/video';
import { cn, formatCompact, formatInt, formatLongDate, parisDate } from '@/lib/utils';
import { getWeeklyGoal, listBoards, postingStats } from '@/lib/v2/board';
import type { LaunchPageData } from '@/lib/v2/launch-view';
import type { PlanItem } from '@/lib/v2/planning';
import { StepFrame, StepNav } from '../step-frame';

const LINK_ERRORS: Record<string, string> = {
  lien: 'Ce n’est pas le lien d’une vidéo TikTok : dans TikTok, touche « Partager » sur ta vidéo, puis « Copier le lien ».',
  court: 'Ce lien court ne s’ouvre pas : ouvre ta vidéo dans TikTok et copie son lien complet.',
  introuvable: 'Cette vidéo est introuvable chez TikTok : vérifie qu’elle est publique, puis réessaie.',
};

function LinkForm({ id, item, label, error }: { id: string; item: PlanItem; label: string; error: string | null }) {
  return (
    <form action={publishVideoAction}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="n" value={item.n} />
        <label htmlFor={`lien-${item.n}`} className="sr-only">
          Lien de ta vidéo n°{item.n} sur TikTok
        </label>
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id={`lien-${item.n}`}
            name="lien"
            type="url"
            inputMode="url"
            required
            defaultValue={item.url ?? ''}
            placeholder="https://www.tiktok.com/@toi/video/…"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `lien-${item.n}-erreur` : undefined}
            className="h-11 w-full rounded-xl border border-line-strong bg-bg pl-9 pr-3 text-sm text-fg placeholder:text-subtle focus:border-cyan-ink/45 focus:outline-none focus:ring-1 focus:ring-cyan-ink/25 aria-[invalid=true]:border-rose-ink"
          />
        </div>
        <SubmitButton pendingLabel="Vérification…" className="h-11">
          <Send className="h-4 w-4" aria-hidden="true" />
          {label}
        </SubmitButton>
      </div>
      {error ? (
        <p id={`lien-${item.n}-erreur`} className="mt-2 text-sm text-rose-ink" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Étape 6 : pour chaque vidéo, coller le lien de la vidéo une fois publiée. C'est ce qui dit à l'appli qu'elle est en
 * ligne : aperçu par le lecteur officiel de TikTok, chiffres publics s'ils existent, compteurs et statut à jour.
 */
export async function PublishStep({ data, profile, searchParams }: { data: LaunchPageData; profile: Pick<Profile, 'id'>; searchParams: Record<string, string | undefined> }) {
  const { launch, board } = data;
  const repo = getRepo();
  const [boards, weekly] = await Promise.all([listBoards(repo, profile.id), getWeeklyGoal(repo, profile.id)]);
  const stats = postingStats(
    [...boards.values()].map((b) => b.data),
    weekly.weekly,
    parisDate(),
  );
  const items = board?.data.items ?? [];
  const posted = items.filter((i) => i.status === 'poste').sort((a, b) => b.n - a.n);
  // Un écran : les vidéos tournées, sinon la prochaine à tourner.
  const filmed = items.filter((i) => i.status === 'tourne');
  const toPublish = filmed.length ? filmed : items.filter((i) => i.status === 'a_tourner').slice(0, 1);
  const errorFor = (n: number) => (searchParams.video === String(n) && searchParams.erreur ? (LINK_ERRORS[searchParams.erreur] ?? null) : null);

  return (
    <StepFrame step="publier" sentence="Une fois ta vidéo publiée sur TikTok, colle son lien ici : c’est ce qui la marque en ligne.">
      {searchParams.ok === 'publie' ? <Callout tone="gain" className="mb-6" title="Vidéo en ligne : ton compteur est à jour." /> : null}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-raised p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Vidéos postées</p>
          <p className="num mt-1 text-2xl font-bold">
            {posted.length} <span className="text-base font-medium text-muted">/ {items.length}</span>
          </p>
          <ProgressBar className="mt-2" value={posted.length} max={Math.max(1, items.length)} label="Vidéos postées sur ce produit" />
        </div>
        <div className="rounded-2xl border border-line bg-raised p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Objectif de la semaine</p>
          <p className="num mt-1 text-2xl font-bold">
            {stats.thisWeek} <span className="text-base font-medium text-muted">/ {stats.weeklyGoal}</span>
          </p>
          <ProgressBar className="mt-2" value={stats.thisWeek} max={stats.weeklyGoal} label="Vidéos postées cette semaine" />
        </div>
      </div>

      {toPublish.length ? (
        <ul className="space-y-3">
          {toPublish.map((item) => (
            <li key={item.n} id={`video-${item.n}`} className="scroll-mt-24 rounded-2xl border border-line bg-raised p-4">
              <p className="mb-3 font-semibold">
                Vidéo n°{item.n}
                <span className="ml-2 text-xs font-medium text-muted">{item.status === 'tourne' ? 'tournée' : 'à tourner'}</span>
              </p>
              <LinkForm id={launch.id} item={item} label="C’est en ligne" error={errorFor(item.n)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-line bg-raised p-4 text-sm text-muted">Toutes tes vidéos sont en ligne. Bravo !</p>
      )}

      {posted.length ? (
        <section aria-labelledby="en-ligne" className="mt-10">
          <h2 id="en-ligne" className="mb-3 text-lg">
            En ligne
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {posted.map((item) => {
              const link = item.url ? parseTikTokLink(item.url) : null;
              return (
                <li key={item.n} id={`video-${item.n}`} className="scroll-mt-24 rounded-2xl border border-line bg-raised p-3">
                  <p className="mb-2 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold">Vidéo n°{item.n}</span>
                    {item.posted_at ? <span className="text-xs text-muted">{formatLongDate(item.posted_at)}</span> : null}
                  </p>
                  {link ? (
                    <div className="overflow-hidden rounded-xl bg-fg/[0.04]">
                      <iframe
                        src={playerUrl(link.id)}
                        title={`Vidéo n°${item.n} sur TikTok`}
                        loading="lazy"
                        allow="encrypted-media; picture-in-picture; fullscreen"
                        className="aspect-[9/16] w-full border-0"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Lien pas encore noté.</p>
                  )}
                  <p className="num mt-2 flex gap-4 text-xs text-muted">
                    <span>
                      <span className={cn('font-semibold', item.views !== null && item.views !== undefined && 'text-fg')}>
                        {item.views !== null && item.views !== undefined ? formatCompact(item.views) : '—'}
                      </span>{' '}
                      vues
                    </span>
                    <span>
                      <span className={cn('font-semibold', item.sales ? 'text-gain' : '')}>{item.sales !== null && item.sales !== undefined ? formatInt(item.sales) : '—'}</span>{' '}
                      ventes
                    </span>
                  </p>
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-muted hover:text-fg">Changer le lien</summary>
                    <div className="mt-2">
                      <LinkForm id={launch.id} item={item} label="Enregistrer" error={errorFor(item.n)} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <StepNav id={launch.id} step="publier" blocked={posted.length ? null : 'Colle le lien de ta première vidéo pour continuer.'} />
    </StepFrame>
  );
}
