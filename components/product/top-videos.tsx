import { Clock, ExternalLink, Eye, Heart, ShoppingBag } from 'lucide-react';
import type { TopVideo } from '@/lib/db/types';
import { formatCompact, formatInt, formatShortDate, quote } from '@/lib/utils';

/** Vidéos qui vendent le produit : chaque chiffre n'apparaît que si la source le donne. */
export function TopVideoList({ videos }: { videos: TopVideo[] }) {
  return (
    <ol className="space-y-2">
      {videos.map((video, index) => (
        <li key={`${video.url ?? video.title}-${index}`} className="flex gap-3 rounded-2xl border border-line p-3.5">
          <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-bold">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-3 font-semibold leading-snug">{video.title}</p>
            {video.hook ? <p className="mt-1 text-sm text-muted">Accroche : {quote(video.hook)}</p> : null}
            <p className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {video.estimated_sales !== null ? (
                <span className="inline-flex items-center gap-1 font-semibold text-gain">
                  <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" /> {formatInt(video.estimated_sales)} ventes estimées
                </span>
              ) : null}
              {video.views !== null ? (
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {formatCompact(video.views)} vues
                </span>
              ) : null}
              {video.likes != null ? (
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" aria-hidden="true" /> {formatCompact(video.likes)}
                </span>
              ) : null}
              {video.duration_s != null ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {video.duration_s} s
                </span>
              ) : null}
              {video.published_at ? <span>publiée le {formatShortDate(video.published_at)}</span> : null}
              {!video.url ? <span>{video.format}</span> : null}
            </p>
            {video.url ? (
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-cyan-ink hover:underline"
              >
                Voir sur TikTok
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
