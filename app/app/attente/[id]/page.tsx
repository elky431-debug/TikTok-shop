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
      <div className="mx-auto max-w-xl py-10">
        <Callout tone="rose" title="Ça n’a pas marché" action={<LinkButton href={record.data.back_path}>Réessayer</LinkButton>}>
          {view.error}
        </Callout>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-6 sm:py-12">
      <div className="rounded-2xl border border-line bg-bg p-6 text-center md:p-8" role="status" aria-live="polite">
        <IconChip size="lg" className="mx-auto">
          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} />
        </IconChip>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">{label.title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{label.sentence}</p>
        <div className="mx-auto mt-8 max-w-sm space-y-3 text-left" aria-hidden="true">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
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
