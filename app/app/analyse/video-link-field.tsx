'use client';

import { AlertCircle, Eye, Heart, Link2, ShoppingBag, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { VideoPreviewResponse } from '@/app/api/video/apercu/route';
import { Spinner } from '@/components/ui/spinner';
import { cn, formatCompact, formatInt } from '@/lib/utils';

const LOOKS_LIKE_TIKTOK = /tiktok\.com\//i;

/**
 * Grand champ « Colle le lien d'une vidéo TikTok » : dès qu'un lien est collé, l'aperçu s'affiche (lecteur officiel
 * TikTok avec la vidéo, son auteur et sa légende, puis la légende et les chiffres connus de notre source).
 */
export function VideoLinkField({ defaultValue = '' }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [state, setState] = useState<{ status: 'idle' | 'loading' } | { status: 'done'; data: VideoPreviewResponse }>({ status: 'idle' });
  const last = useRef('');

  useEffect(() => {
    const link = value.trim();
    if (!LOOKS_LIKE_TIKTOK.test(link)) {
      last.current = '';
      setState({ status: 'idle' });
      return;
    }
    if (link === last.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      last.current = link;
      setState({ status: 'loading' });
      try {
        const res = await fetch(`/api/video/apercu?lien=${encodeURIComponent(link)}`, { signal: controller.signal });
        const data = (await res.json()) as VideoPreviewResponse;
        setState({ status: 'done', data });
      } catch {
        if (!controller.signal.aborted)
          setState({ status: 'done', data: { ok: false, message: 'Aperçu indisponible pour le moment. Tu peux quand même lancer l’analyse.' } });
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const preview = state.status === 'done' && state.data.ok ? state.data : null;
  const error = state.status === 'done' && !state.data.ok ? state.data.message : null;

  return (
    <div>
      <label htmlFor="lien" className="sr-only">
        Lien de la vidéo TikTok
      </label>
      <div className="relative">
        <Link2 className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          id="lien"
          name="lien"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Colle le lien d’une vidéo TikTok"
          aria-describedby="lien-etat"
          className="h-16 w-full rounded-2xl border border-line-strong bg-raised pl-14 pr-12 text-base font-medium outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-cyan-ink/60 focus:shadow-[0_0_0_4px_rgb(var(--cyan)/0.12)] sm:text-lg"
        />
        {state.status === 'loading' ? (
          <span className="absolute right-5 top-1/2 -translate-y-1/2">
            <Spinner />
          </span>
        ) : null}
      </div>

      <div id="lien-etat" aria-live="polite">
        {error ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-rose-ink">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
        {preview ? (
          <div className="mt-4 flex animate-fade-up gap-4 rounded-2xl border border-line bg-raised p-3 motion-reduce:animate-none sm:gap-5 sm:p-4">
            <div className="w-32 shrink-0 overflow-hidden rounded-xl bg-surface sm:w-40">
              <iframe
                src={preview.player}
                title="Aperçu de la vidéo TikTok"
                className="aspect-[9/16] w-full"
                allow="encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
            </div>
            <div className="min-w-0 flex-1 py-1">
              <p className="truncate text-sm font-bold">{preview.facts?.author ?? 'Vidéo TikTok'}</p>
              {preview.facts?.caption ? (
                <p className="mt-1.5 line-clamp-4 text-sm leading-relaxed text-muted">{preview.facts.caption}</p>
              ) : (
                <p className="mt-1.5 text-sm text-muted">
                  Légende inconnue de notre source. Ajoute le texte de la vidéo dans les options pour une analyse plus précise.
                </p>
              )}
              {preview.facts ? (
                <ul className="num mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
                  {preview.facts.duration_s ? <Fact icon={<Timer />}>{preview.facts.duration_s} s</Fact> : null}
                  {preview.facts.views !== null ? <Fact icon={<Eye />}>{formatCompact(preview.facts.views)} vues</Fact> : null}
                  {preview.facts.likes !== null ? <Fact icon={<Heart />}>{formatCompact(preview.facts.likes)}</Fact> : null}
                  {preview.facts.sales !== null ? (
                    <Fact icon={<ShoppingBag />} tone="gain">
                      {formatInt(preview.facts.sales)} ventes
                    </Fact>
                  ) : null}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ icon, children, tone }: { icon: React.ReactNode; children: React.ReactNode; tone?: 'gain' }) {
  return (
    <li
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 [&_svg]:h-3.5 [&_svg]:w-3.5',
        tone === 'gain' ? 'border-gain/30 bg-gain-soft text-gain' : 'border-line text-muted',
      )}
    >
      {icon}
      {children}
    </li>
  );
}
