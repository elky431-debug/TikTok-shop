import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Celebration } from '@/components/launch/celebration';
import { LaunchStepView } from '@/components/launch/steps';
import { LaunchTimeline } from '@/components/launch/timeline';
import { STAGE_TONES } from '@/components/manager/stage-tones';
import { ProductImage } from '@/components/product/product-image';
import { Callout } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { fallbackImageUrl } from '@/lib/product-image';
import { displayName } from '@/lib/product-name';
import { cn } from '@/lib/utils';
import { isLaunchStep } from '@/lib/v2/launch';
import { getLaunch } from '@/lib/v2/launch-store';
import { loadLaunchPage } from '@/lib/v2/launch-view';
import { STAGE_LABELS } from '@/lib/v2/manager';

export const metadata: Metadata = { title: 'Lancement' };

/** Un lancement : frise des étapes en haut, l'étape affichée en dessous (celle où il en est, ou celle choisie). */
export default async function LaunchPage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const launch = await getLaunch(repo, profile.id, params.id);
  if (!launch) notFound();
  const data = await loadLaunchPage(repo, profile, launch);
  const step = isLaunchStep(searchParams.etape) ? searchParams.etape : launch.data.step;
  const name = data.product ? displayName(data.product) : launch.data.product_name;
  const closed = launch.data.state !== 'en_cours';

  return (
    <div>
      <Suspense fallback={null}>
        <Celebration />
      </Suspense>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/lancer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Lancer un produit
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <ProductImage
            src={data.product?.image_url ?? ''}
            fallback={fallbackImageUrl(launch.data.product_id, data.product?.niche ?? 'maison')}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', STAGE_TONES[data.stage])}>{STAGE_LABELS[data.stage]}</span>
          </div>
        </div>
      </div>
      {closed ? (
        <Callout tone="neutral" className="mb-6" title={launch.data.state === 'termine' ? 'Lancement terminé' : 'Lancement abandonné'}>
          Il est rangé dans l’historique. Tu peux le reprendre depuis{' '}
          <Link href="/app/lancer#historique" className="font-semibold text-fg underline underline-offset-2">
            Lancer un produit
          </Link>
          .
        </Callout>
      ) : null}
      <LaunchTimeline id={launch.id} done={data.done} viewing={step} />
      <LaunchStepView step={step} data={data} profile={profile} searchParams={searchParams} />
    </div>
  );
}
