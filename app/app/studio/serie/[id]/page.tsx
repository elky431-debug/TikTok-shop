import type { Metadata } from 'next';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StudioNav } from '@/components/studio/studio-nav';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, ProgressBar } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { angleLabel, formatLabel } from '@/lib/ai/formats';
import { getUsageToday } from '@/lib/studio';
import { getSeries, writtenAngles } from '@/lib/studio/series';
import { cn, formatRelative } from '@/lib/utils';
import { writeAngleAction } from '../actions';
import { isUnlimited } from '@/lib/plans';
import { shortLabel } from '@/lib/product-name';

export const metadata: Metadata = { title: 'Série de 20 vidéos' };

export default async function SeriesDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { erreur?: string; angle?: string } }) {
  const { profile } = await requireOnboardedViewer('/app/studio/serie');
  const series = await getSeries(profile, params.id);
  if (!series) notFound();
  const [written, usage] = await Promise.all([writtenAngles(profile, series.id), getUsageToday(profile)]);
  const total = series.data.angles.length;
  const done = Math.min(total, written.size);
  const errorAngle = searchParams.angle !== undefined ? Number(searchParams.angle) : -1;

  return (
    <div>
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-muted">
        <Link href="/app/studio" className="hover:text-fg">
          Studio
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href="/app/studio/serie" className="hover:text-fg">
          Séries
        </Link>
      </nav>
      <header className="mb-6">
        <p className="eyebrow">Série de {total} vidéos</p>
        <h1 className="mt-1 text-2xl sm:text-3xl">{shortLabel(series.data.product_name)}</h1>
        <p className="mt-1.5 text-sm text-muted">Créée {formatRelative(series.created_at)} · un angle différent par vidéo, sans répétition.</p>
        <div className="mt-4 max-w-md">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="font-semibold">Objectif : 20 vidéos sur ce produit</span>
            <span className="num text-muted">
              {done}/{total}
            </span>
          </div>
          <ProgressBar value={done} max={total} label={`${done} vidéos écrites sur ${total}`} />
        </div>
        <p className="mt-3 flex flex-wrap gap-2">
          {series.data.simulated ? <Badge tone="warn">Mode démo : angles simulés</Badge> : null}
          {series.data.duplicates_removed > 0 ? (
            <Badge tone="neutral">
              {series.data.duplicates_removed} doublon{series.data.duplicates_removed > 1 ? 's' : ''} écarté{series.data.duplicates_removed > 1 ? 's' : ''}
            </Badge>
          ) : null}
          {series.data.filled > 0 ? <Badge tone="warn">{series.data.filled} angle{series.data.filled > 1 ? 's' : ''} complété{series.data.filled > 1 ? 's' : ''} en simulé</Badge> : null}
        </p>
      </header>
      <StudioNav active="serie" />

      {searchParams.erreur && errorAngle < 0 ? (
        <Callout tone="rose" className="mb-6" title="Scripts non écrits">
          {searchParams.erreur}
        </Callout>
      ) : null}
      <p className="mb-4 text-sm text-muted">
        {isUnlimited(profile.plan, 'scriptsPerDay')
          ? 'Écritures illimitées : écris tous les angles qui te parlent.'
          : `Écrire un angle utilise une de tes écritures du jour : il t’en reste ${usage.remaining}.`}
      </p>

      <ol className="grid gap-3 md:grid-cols-2">
        {series.data.angles.map((angle, i) => {
          const doc = written.get(i);
          return (
            <li key={i} id={`angle-${i + 1}`} className={cn('feature-card scroll-mt-20 p-4', doc && 'border-gain/30')}>
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    doc ? 'bg-gain-soft text-gain' : 'bg-surface text-muted',
                  )}
                  aria-hidden="true"
                >
                  {doc ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold leading-snug">
                    <span className="sr-only">Vidéo {i + 1} : </span>
                    {angle.title}
                  </h2>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone="cyan">{formatLabel(angle.format)}</Badge>
                    <Badge tone="neutral">{angleLabel(angle.angle)}</Badge>
                  </p>
                  <p className="mt-2 font-medium">«&nbsp;{angle.hook}&nbsp;»</p>
                  <p className="mt-1 text-sm text-muted">{angle.pitch}</p>
                  {errorAngle === i && searchParams.erreur ? (
                    <Callout tone="rose" className="mt-3">
                      {searchParams.erreur}
                    </Callout>
                  ) : null}
                  <div className="mt-3">
                    {doc ? (
                      <Link href={`/app/studio/${doc.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-ink hover:underline">
                        Voir les scripts
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    ) : (
                      <form action={writeAngleAction}>
                        <input type="hidden" name="serie" value={series.id} />
                        <input type="hidden" name="angle" value={i} />
                        <SubmitButton size="sm" pendingLabel="Écriture…" disabled={usage.remaining <= 0}>
                          Écrire ce script
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
