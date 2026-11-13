import { Badge } from '@/components/ui/surface';
import { HOOK_TYPE_LABELS, type HookAnalysis } from '@/lib/radar/hook-analysis';
import { formatRelative, quote } from '@/lib/utils';

/** Analyse des accroches des vidéos qui vendent : une ligne par vidéo, dans l'ordre de la liste des vidéos. */
export function HookAnalysisView({ analysis }: { analysis: HookAnalysis }) {
  return (
    <div className="rounded-2xl border border-line bg-raised p-4">
      <p className="text-sm font-medium">{analysis.summary}</p>
      <ol className="mt-3 divide-y divide-line">
        {analysis.videos.map((video) => (
          <li key={video.index} className="flex gap-3 py-3 first:pt-1 last:pb-0">
            <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold">{video.index}</span>
            <div className="min-w-0 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <Badge tone="cyan">{HOOK_TYPE_LABELS[video.hook_type]}</Badge>
                {video.duration ? <span className="num text-xs text-muted">Format {video.duration}</span> : <span className="text-xs text-muted">Durée non fournie</span>}
              </p>
              <p className="mt-1.5 font-semibold leading-snug">{quote(video.hook)}</p>
              <p className="mt-1 text-muted">{video.structure}</p>
              <p className="mt-1 text-muted">{video.why}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        {analysis.source === 'ia' ? 'Analyse écrite par l’IA' : 'Analyse simulée (sans IA)'} à partir du texte et des chiffres des vidéos,{' '}
        {formatRelative(analysis.generated_at)}. Les vidéos ne sont pas regardées : seule leur description est lue.
      </p>
    </div>
  );
}
