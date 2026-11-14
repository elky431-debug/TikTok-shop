import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { LinkButton } from '@/components/ui/button';
import { Callout, IconChip, Skeleton } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { TASK_KIND, taskView, type TaskData, type TaskType } from '@/lib/tasks';
import { AutoRefresh } from './auto-refresh';

export const metadata: Metadata = { title: 'En cours' };
export const dynamic = 'force-dynamic';

const LABELS: Record<TaskType, { title: string; sentence: string; where: string }> = {
  studio: { title: 'On écrit tes scripts', sentence: '10 accroches et 3 scripts complets : compte 20 à 40 secondes.', where: 'ton studio' },
  angle: { title: 'On écrit tes scripts', sentence: '10 accroches et 3 scripts sur cet angle : compte 20 à 40 secondes.', where: 'ton studio' },
  serie: { title: 'On imagine tes 20 angles', sentence: '20 façons différentes de présenter ce produit : compte 20 à 40 secondes.', where: 'la série de 20' },
  style: { title: 'On analyse ton style', sentence: 'Ta façon de parler, tes tics, ta longueur de phrase : compte 10 à 20 secondes.', where: 'Mon style' },
  analyse: { title: 'On décortique la vidéo', sentence: 'Découpage seconde par seconde et version adaptée à ton produit : compte 20 à 40 secondes.', where: 'Analyse de vidéo' },
  offre: { title: 'On lit la proposition', sentence: 'Conditions, note sur 100 et trois réponses prêtes : compte 10 à 30 secondes.', where: 'Propositions de marques' },
  preparation: { title: 'On prépare ton plan de 30 jours', sentence: 'Une idée de vidéo par jour dans ta niche : compte 20 à 40 secondes.', where: 'Préparation' },
  accroches: { title: 'On analyse les accroches', sentence: 'Ce qui fait vendre les vidéos de ce produit : compte 10 à 30 secondes.', where: 'la fiche produit' },
};

/**
 * Page d'attente d'une tâche d'IA en arrière-plan : se rafraîchit toute seule, puis ouvre le résultat. On peut la quitter :
 * le travail continue et son résultat se retrouve à sa place habituelle.
 */
export default async function TaskPage({ params }: { params: { id: string } }) {
  const { profile } = await requireOnboardedViewer('/app');
  const record = await getRepo().getRecord<TaskData>(profile.id, params.id);
  if (!record || record.kind !== TASK_KIND) notFound();
  const view = taskView(record.data);
  if (view.path) redirect(view.path);
  const label = LABELS[record.data.type] ?? LABELS.studio;

  if (view.state === 'echec') {
    return (
      <div className="py-4">
        <Callout tone="rose" title="Ça n’a pas marché" action={<LinkButton href={record.data.back_path}>Réessayer</LinkButton>}>
          {view.error}
        </Callout>
      </div>
    );
  }

  return (
    <div className="py-2 sm:py-4">
      {/* Pleine largeur : l'en-tête à gauche, puis l'aperçu de ce qui arrive (squelette) sur toute la largeur. */}
      <div className="rounded-2xl border border-line bg-bg p-5 sm:p-6 md:p-8" role="status" aria-live="polite">
        <div className="flex items-start gap-4">
          <IconChip size="lg" className="shrink-0">
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} />
          </IconChip>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{label.title}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{label.sentence}</p>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" aria-hidden="true">
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <p className="mt-8 text-xs text-muted">
          {view.slow ? 'C’est plus long que d’habitude, mais ça avance. ' : ''}Tu peux quitter cette page : le résultat t’attendra dans{' '}
          {label.where}.
        </p>
      </div>
      <AutoRefresh />
    </div>
  );
}
