import type { Metadata } from 'next';
import { Bell, Clapperboard, Euro, Flame, History, PenLine, Star } from 'lucide-react';
import Link from 'next/link';
import { DashboardPanel } from '@/components/dashboard/home-panel';
import { CountUp } from '@/components/dashboard/widgets';
import { ManagerTabs } from '@/components/manager/store-manager';
import { ProductImage } from '@/components/product/product-image';
import { LinkButton } from '@/components/ui/button';
import { Badge, Callout, EmptyState, IconChip } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { cleanHandle } from '@/lib/creator-profile';
import { loadDashboard } from '@/lib/dashboard';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { fallbackImageUrl } from '@/lib/product-image';
import { getRadar } from '@/lib/radar';
import { parseFilters } from '@/lib/radar-filters';
import { getRadarSettings } from '@/lib/radar/settings';
import { commissionPerSale } from '@/lib/score';
import { cn, formatDayMonth, formatEuros, parisDate, plural } from '@/lib/utils';
import { getWeeklyGoal } from '@/lib/v2/board';
import { loadManager } from '@/lib/v2/manager';
import { managerFlash, managerTab } from '@/lib/v2/manager-flash';

export const metadata: Metadata = { title: 'Dashboard' };

const ACTIVITY_ICONS = { script: PenLine, gain: Euro, video: Clapperboard, alerte: Bell, suivi: Star } as const;

function relativeDay(iso: string, today: string): string {
  const day = iso.slice(0, 10);
  if (day === today) return 'Aujourd’hui';
  const diff = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
  if (diff === 1) return 'Hier';
  return formatDayMonth(day);
}

/**
 * Dashboard (accueil de l'appli) : le tableau de bord et le gestionnaire réunis. Profil et période, une rangée de
 * chiffres, le graphique des commissions et des ventes à côté du produit du jour, les onglets du gestionnaire, puis
 * l'activité récente. Un seul graphique, une seule série de chiffres.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app');
  const plan = getPlan(profile.plan);
  const repo = getRepo();
  const settings = await getRadarSettings(profile.id);
  const [data, manager, radar, weekly] = await Promise.all([
    loadDashboard(repo, profile),
    loadManager(repo, profile.id, { today: parisDate(), canEarnings: plan.earnings }),
    getRadar(profile, parseFilters({}), { settings }),
    getWeeklyGoal(repo, profile.id),
  ]);
  const top = radar.items.find((i) => i.kind === 'visible');
  const product = top?.kind === 'visible' ? top.product : null;
  const welcome = searchParams.bienvenue;
  const access = searchParams.acces;
  const paid = searchParams.paiement === 'ok';
  const handle = cleanHandle(profile.tiktok_handle);
  const name = profile.first_name ?? 'Mon compte';

  const profileBlock = (
    <div className="flex min-w-0 items-center gap-4">
      <span className="shrink-0 rounded-full bg-[image:var(--gradient-diag)] p-[2px]" aria-hidden="true">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg text-xl font-bold text-fg">
          {name.trim().charAt(0).toUpperCase() || '?'}
        </span>
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-tight md:text-[1.75rem]">
          <span className="text-gradient">Dashboard</span> <span className="text-fg">de {name}</span>
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          {handle ? (
            <span>@{handle}</span>
          ) : (
            <Link href="/app/compte#profil" className="font-semibold text-cyan-ink hover:underline">
              Ajouter mon pseudo TikTok
            </Link>
          )}
          <Badge tone={plan.access ? 'cyan' : 'neutral'}>{plan.name}</Badge>
          <span className="inline-flex items-center gap-1 font-semibold text-fg" title="Jours d’affilée avec au moins une vidéo postée">
            <Flame className={cn('h-4 w-4', data.streak > 0 ? 'text-rose-ink' : 'text-muted')} aria-hidden="true" />
            {plural(data.streak, 'jour', 'jours')} de série
          </span>
        </p>
      </div>
    </div>
  );

  const productCard = (
    <div
      id="produit-du-jour"
      className={cn(
        'flex scroll-mt-24 flex-col rounded-2xl border border-l-4 border-line border-l-cyan-ink bg-bg p-6',
        welcome && product && 'shadow-[0_0_60px_-12px_rgb(var(--cyan)/0.55)] ring-1 ring-cyan-ink/50',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Produit du jour</p>
        {product ? <Badge tone="cyan">n°1 du radar</Badge> : null}
      </div>
      {product ? (
        <>
          <div className="mt-4 flex gap-4">
            <ProductImage src={product.image_url} fallback={product.image_fallback || fallbackImageUrl(product.id, product.niche)} alt="" className="w-20" />
            <div className="min-w-0">
              <Link
                href={`/app/produit/${encodeURIComponent(product.id)}`}
                className="line-clamp-3 font-semibold leading-snug hover:underline hover:underline-offset-4"
              >
                {product.name}
              </Link>
              <p className="mt-1 text-sm font-semibold text-gain">{formatEuros(commissionPerSale(product.price_cents, product.commission_rate))} / vente</p>
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between gap-3">
            {product.score !== null ? (
              <p className="font-bold">
                <span className="num split-glow text-5xl leading-none tracking-tight text-fg">
                  <CountUp value={product.score} />
                </span>
                <span className="text-base text-muted">/100</span>
              </p>
            ) : null}
            <p className="text-right text-xs text-muted">
              Commission <span className="block text-sm font-semibold text-fg">{Math.round(product.commission_rate * 100)} %</span>
            </p>
          </div>
          <div className="mt-auto flex flex-col gap-2 pt-6">
            <LinkButton href={`/app/studio?produit=${encodeURIComponent(product.id)}`} className="w-full" arrow>
              Écrire mes scripts
            </LinkButton>
            <LinkButton href={`/app/produit/${encodeURIComponent(product.id)}`} variant="ghost" className="w-full">
              Voir la fiche
            </LinkButton>
          </div>
        </>
      ) : (
        <div className="mt-4 flex flex-1 flex-col items-start justify-center gap-3">
          <p className="text-sm text-muted">Pas encore de produit du jour pour tes niches.</p>
          <LinkButton href="/app/radar" variant="outline" size="sm" arrow>
            Ouvrir le radar
          </LinkButton>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-10">
      {welcome || access || paid || radar.demo ? (
        <div className="space-y-3">
          {paid ? (
            <Callout tone="gain" title={`Ton abonnement ${plan.name} est actif`}>
              Bienvenue ! Une confirmation t’a été envoyée par e-mail. Commence par ton produit du jour, puis écris tes scripts.
            </Callout>
          ) : null}
          {welcome && !paid ? <Callout tone="cyan" title="Ton radar est prêt" /> : null}
          {access === 'formateur' ? (
            <Callout tone="warn" title="Espace réservé aux formateurs" />
          ) : access === 'admin' ? (
            <Callout tone="warn" title="Espace réservé à l’équipe" />
          ) : null}
          {radar.demo ? <Callout tone="neutral" title="Produits fictifs : démonstration" /> : null}
        </div>
      ) : null}

      <DashboardPanel profile={profileBlock} data={manager} weeklyGoal={weekly.weekly} productCard={productCard} />

      <ManagerTabs data={manager} initialTab={managerTab(searchParams.onglet)} flash={managerFlash(searchParams)} />

      <section aria-labelledby="activite-titre" className="rounded-2xl border border-line bg-bg p-6">
        <div className="mb-4 flex items-center gap-3">
          <IconChip tone="neutral">
            <History className="h-4 w-4" strokeWidth={1.75} />
          </IconChip>
          <h2 id="activite-titre" className="text-base font-semibold">
            Activité récente
          </h2>
        </div>
        {data.activity.length ? (
          <ul className="grid grid-cols-1 gap-x-8 gap-y-1 lg:grid-cols-2">
            {data.activity.map((a, i) => {
              const Icon = ACTIVITY_ICONS[a.kind];
              return (
                <li key={`${a.kind}-${a.at}-${i}`}>
                  <Link href={a.href} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-fg/5">
                    <Icon className="h-4 w-4 shrink-0 text-cyan-ink" strokeWidth={1.75} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm">{a.text}</span>
                    <span className="shrink-0 text-xs text-muted">{relativeDay(a.at, data.today)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="Rien pour l’instant"
            action={
              product ? (
                <LinkButton href={`/app/studio?produit=${encodeURIComponent(product.id)}`} variant="secondary">
                  Écrire mes premiers scripts
                </LinkButton>
              ) : null
            }
          />
        )}
      </section>
    </div>
  );
}
