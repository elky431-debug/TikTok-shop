import type { Metadata } from 'next';
import {
  Bell,
  ChevronRight,
  Clapperboard,
  Euro,
  Flame,
  History,
  PenLine,
  Radar as RadarIcon,
  ShoppingBag,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { CascadeItem, Cascade, CountUp, CreatorRefresh, GainsChart, ProgressRing, UpcomingList } from '@/components/dashboard/widgets';
import { ProductImage } from '@/components/product/product-image';
import { Sparkline } from '@/components/product/sparkline';
import { LinkButton } from '@/components/ui/button';
import { Badge, Callout, EmptyState, IconChip, SectionTitle, TrendPill } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { cleanHandle, creatorRefreshPolicy } from '@/lib/creator-profile';
import { loadDashboard, type Kpi } from '@/lib/dashboard';
import { getRepo } from '@/lib/db';
import { fallbackImageUrl } from '@/lib/product-image';
import { getPlan } from '@/lib/plans';
import { followerRangeLabel } from '@/lib/profile-rules';
import { getRadar } from '@/lib/radar';
import { parseFilters } from '@/lib/radar-filters';
import { getRadarSettings } from '@/lib/radar/settings';
import { commissionPerSale } from '@/lib/score';
import { cn, formatCompact, formatDayMonth, formatEuros, formatInt, plural } from '@/lib/utils';
import { goalProgress } from '@/lib/v2/earnings';

export const metadata: Metadata = { title: 'Dashboard' };

const KPI_ICONS: Record<Kpi['key'], typeof Euro> = { gains: Euro, ventes: ShoppingBag, videos: Video, suivis: Star, alertes: Bell };

const ACTIVITY_ICONS = { script: PenLine, gain: Euro, video: Clapperboard, alerte: Bell, suivi: Star } as const;

function relativeDay(iso: string, today: string): string {
  const day = iso.slice(0, 10);
  if (day === today) return 'Aujourd’hui';
  const diff = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
  if (diff === 1) return 'Hier';
  return formatDayMonth(day);
}

function KpiCard({ kpi, index }: { kpi: Kpi; index: number }) {
  const Icon = KPI_ICONS[kpi.key];
  const accent = index % 2 === 0;
  return (
    <div
      className={cn(
        'relative h-full overflow-hidden rounded-2xl border border-line bg-bg p-5 transition-all hover:border-line-strong',
        accent ? 'hover:shadow-[0_0_40px_-12px_rgb(var(--cyan)/0.2)]' : 'hover:shadow-[0_0_28px_-12px_rgb(var(--fg)/0.06)]',
      )}
    >
      <Icon className={cn('absolute right-4 top-4 h-5 w-5', accent ? 'text-cyan-ink/60' : 'text-fg/30')} strokeWidth={1.5} aria-hidden="true" />
      <p className="text-3xl font-bold tabular-nums text-fg">
        {kpi.value === null ? (
          <span className="text-muted">—</span>
        ) : kpi.format === 'ratio' ? (
          <>
            <CountUp value={kpi.value} />
            <span className="text-lg text-muted"> / {formatInt(kpi.goal ?? 0)}</span>
          </>
        ) : (
          <CountUp value={kpi.value} format={kpi.format === 'euros' ? 'euros' : 'int'} />
        )}
      </p>
      <p className="mt-2 pr-8 text-[11px] font-medium leading-snug text-muted">{kpi.label}</p>
      {kpi.locked ? (
        <Link href="/app/passer-pro" className="mt-3 inline-flex text-xs font-semibold text-cyan-ink hover:underline">
          Inclus dans Pro
        </Link>
      ) : kpi.variation ? (
        <p className="mt-3 flex flex-wrap items-center gap-1.5">
          <TrendPill direction={kpi.variation.direction} className="px-2 py-0.5 text-xs">
            {kpi.variation.direction === 'up' ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : null}
            {kpi.variation.direction === 'down' ? <TrendingDown className="h-3 w-3" aria-hidden="true" /> : null}
            {kpi.variation.label}
          </TrendPill>
          <span className="text-[11px] text-muted">{kpi.variation.compare}</span>
        </p>
      ) : null}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { profile } = await requireOnboardedViewer();
  const repo = getRepo();
  const plan = getPlan(profile.plan);
  const settings = await getRadarSettings(profile.id);
  const [data, radar] = await Promise.all([loadDashboard(repo, profile), getRadar(profile, parseFilters({}), { settings })]);
  const top = radar.items.find((i) => i.kind === 'visible');
  const product = top?.kind === 'visible' ? top.product : null;
  const welcome = searchParams.bienvenue;
  const access = searchParams.acces;
  const handle = cleanHandle(profile.tiktok_handle);
  const creator = data.creator && handle && data.creator.handle.toLowerCase() === handle.toLowerCase() ? data.creator : null;
  const refresh = creatorRefreshPolicy(data.creator, handle, profile.plan);
  const gainsKpi = data.kpis[0];
  const progress = goalProgress(data.monthGains, data.goalCents);
  const firstName = profile.first_name ?? 'toi';

  return (
    <div className="space-y-8 lg:space-y-12">
      <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Vue d’ensemble</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-[2rem]">
            <span className="text-gradient">Dashboard</span> <span className="text-fg">de {firstName}</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Tes gains, tes vidéos de la semaine et le produit du jour, en un coup d’œil.
          </p>
        </div>
        <LinkButton
          href="/app/radar"
          variant="secondary"
          className="h-auto shrink-0 rounded-full border-fg/20 bg-bg px-5 py-2.5 hover:border-cyan-ink/45 hover:bg-cyan-ink/10 hover:text-cyan-ink"
          arrow
        >
          Ouvrir le radar
        </LinkButton>
      </header>

      {welcome || access || radar.demo ? (
        <div className="space-y-3">
          {welcome === 'essai' ? (
            <Callout tone="gain" title="Tes 3 mois de Pro sont activés">
              Merci à ton formateur : radar complet, score, 30 scripts par jour et récap Discord. Aucune carte n’a été demandée.
            </Callout>
          ) : welcome ? (
            <Callout tone="cyan" title="Ton radar est prêt">
              Voici ton produit du jour : ouvre sa fiche, puis écris tes scripts. Objectif : 20 vidéos sur un même produit.
            </Callout>
          ) : null}
          {access === 'formateur' ? (
            <Callout tone="warn" title="Espace réservé aux formateurs">
              Ton compte n’est pas un compte formateur. Tu peux devenir formateur partenaire depuis la page Formateurs du site.
            </Callout>
          ) : access === 'admin' ? (
            <Callout tone="warn" title="Espace réservé à l’équipe">Cette page est réservée aux administrateurs.</Callout>
          ) : null}
          {radar.demo ? (
            <Callout tone="neutral" title="Produits fictifs : démonstration">
              Ces produits n’existent pas sur TikTok Shop : ils montrent comment marche l’appli en attendant les vraies données.
            </Callout>
          ) : null}
        </div>
      ) : null}

      {/* Profil */}
      <section aria-labelledby="profil-titre" className="flex flex-col gap-5 rounded-2xl border border-line bg-bg p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="rounded-full bg-[image:var(--gradient-diag)] p-[2px]" aria-hidden="true">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg text-xl font-bold text-fg">
              {(profile.first_name ?? profile.email).trim().charAt(0).toUpperCase() || '?'}
            </span>
          </span>
          <div className="min-w-0">
            <h2 id="profil-titre" className="truncate text-lg font-semibold">
              {profile.first_name ?? 'Mon compte'}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              {handle ? <span>@{handle}</span> : <Link href="/app/compte#profil" className="font-semibold text-cyan-ink hover:underline">Ajouter mon pseudo TikTok</Link>}
              <Badge tone={plan.id === 'free' ? 'neutral' : 'cyan'}>{plan.name}</Badge>
              <Badge tone={profile.eligibility === 'affilie' ? 'gain' : 'warn'}>{profile.eligibility === 'affilie' ? 'Affilié' : 'En préparation'}</Badge>
              <span className="inline-flex items-center gap-1 font-semibold text-fg" title="Jours d’affilée avec au moins une vidéo postée">
                <Flame className={cn('h-4 w-4', data.streak > 0 ? 'text-rose-ink' : 'text-muted')} aria-hidden="true" />
                {plural(data.streak, 'jour', 'jours')} de série
              </span>
            </p>
          </div>
        </div>
        <div className="min-w-0 border-t border-line pt-4 text-sm sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          {creator?.fetched_at ? (
            <>
              <dl className="flex gap-6">
                {[
                  { label: 'abonnés', value: creator.followers },
                  { label: 'j’aime', value: creator.likes },
                  { label: 'vidéos', value: creator.videos },
                ].map((s) => (
                  <div key={s.label}>
                    <dt className="sr-only">{s.label}</dt>
                    <dd className="text-xl font-bold tabular-nums">{s.value === null ? '—' : formatCompact(s.value)}</dd>
                    <dd className="text-xs text-muted" aria-hidden="true">
                      {s.label}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                Relevé public du {formatDayMonth(creator.fetched_at.slice(0, 10))} (Nexscope)
                <CreatorRefresh {...refresh} />
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">{followerRangeLabel(profile.follower_range)} abonnés</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                Chiffre déclaré dans ton compte.
                {refresh.auto || refresh.manual ? <CreatorRefresh {...refresh} /> : (
                  <Link href="/app/compte#profil" className="font-semibold text-cyan-ink hover:underline">
                    Mettre à jour
                  </Link>
                )}
              </p>
              {data.creator?.error ? <p className="mt-1 text-xs text-warn">{data.creator.error}</p> : null}
            </>
          )}
        </div>
      </section>

      {/* Zone principale : produit du jour d'abord sur téléphone, gains à gauche sur grand écran */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
        <div id="produit-du-jour"
          className={cn(
            'order-1 scroll-mt-24 rounded-2xl border border-l-4 border-line border-l-cyan-ink bg-bg p-6 md:p-7 lg:order-2 lg:col-span-4',
            welcome && product && 'shadow-[0_0_60px_-12px_rgb(var(--cyan)/0.55)] ring-1 ring-cyan-ink/50',
          )}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Produit du jour</p>
            {product ? <Badge tone="cyan">n°1 du radar</Badge> : null}
          </div>
          {product ? (
            <>
              <div className="mt-4 flex gap-4">
                <ProductImage src={product.image_url} fallback={product.image_fallback || fallbackImageUrl(product.id, product.niche)} alt="" className="w-20" />
                <div className="min-w-0">
                  <Link href={`/app/produit/${encodeURIComponent(product.id)}`} className="line-clamp-3 font-semibold leading-snug hover:underline hover:underline-offset-4">
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
                    <span className="mt-1 block text-xs font-medium text-muted">Score d’opportunité</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted">
                    Score réservé à Pro.{' '}
                    <Link href="/app/passer-pro" className="font-semibold text-cyan-ink hover:underline">
                      Voir Pro
                    </Link>
                  </p>
                )}
                <p className="text-right text-xs text-muted">
                  Commission <span className="block text-sm font-semibold text-fg">{Math.round(product.commission_rate * 100)} %</span>
                </p>
              </div>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <LinkButton href={`/app/studio?produit=${encodeURIComponent(product.id)}`} className="w-full sm:w-auto lg:w-full xl:w-auto" arrow>
                  Écrire mes scripts
                </LinkButton>
                <LinkButton href={`/app/produit/${encodeURIComponent(product.id)}`} variant="ghost" className="w-full sm:w-auto lg:w-full xl:w-auto">
                  Voir la fiche
                </LinkButton>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Le relevé de cette nuit n’a pas encore de produit pour tes niches. Repasse demain matin, ou{' '}
              <Link href="/app/radar" className="font-semibold text-cyan-ink hover:underline">
                ouvre le radar
              </Link>
              .
            </p>
          )}
        </div>

        <div className="order-2 rounded-2xl border border-line bg-bg p-6 md:p-8 lg:order-1 lg:col-span-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Gains et ventes</p>
          {!data.earningsEnabled ? (
            <EmptyState
              className="mt-6"
              icon={<Euro className="h-5 w-5" strokeWidth={1.75} />}
              title="Suis tes commissions jour après jour"
              action={<LinkButton href="/app/passer-pro" arrow>Passer Pro</LinkButton>}
            >
              Le suivi des gains (saisie ou import du relevé TikTok Shop) est inclus dans Pro.
            </EmptyState>
          ) : !data.hasEarnings ? (
            <EmptyState
              className="mt-6"
              icon={<Euro className="h-5 w-5" strokeWidth={1.75} />}
              title="Ta courbe apparaîtra ici"
              action={<LinkButton href="/app/gains" arrow>Saisir mes gains</LinkButton>}
            >
              Note tes commissions (ou importe ton relevé TikTok Shop) : tu verras tes gains et tes ventes sur 7, 30 et 90 jours.
            </EmptyState>
          ) : (
            <>
              <div className="mt-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">Ce mois-ci</p>
                <p className="mt-2 text-[2.5rem] font-bold leading-none tracking-tight md:text-[2.85rem] lg:text-[3.25rem]">
                  <CountUp value={data.monthGains} format="euros" className="text-gradient" />
                </p>
                {gainsKpi.variation ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <TrendPill direction={gainsKpi.variation.direction}>
                      {gainsKpi.variation.direction === 'up' ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                      {gainsKpi.variation.direction === 'down' ? <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                      {gainsKpi.variation.label}
                    </TrendPill>
                    <span className="text-xs text-muted">{gainsKpi.variation.compare}</span>
                  </div>
                ) : null}
                <p className="mt-4 max-w-lg text-xs leading-relaxed text-muted">Montants saisis ou importés par toi : rien n’est estimé.</p>
              </div>
              <div className="mt-8">
                <GainsChart series={data.series} />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Indicateurs */}
      <section aria-labelledby="indicateurs">
        <SectionTitle id="indicateurs">Indicateurs</SectionTitle>
        <Cascade className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {data.kpis.map((kpi, i) => (
            <CascadeItem key={kpi.key} className={i === data.kpis.length - 1 ? 'col-span-2 lg:col-span-1' : undefined}>
              <KpiCard kpi={kpi} index={i} />
            </CascadeItem>
          ))}
        </Cascade>
      </section>

      {/* À tourner + objectif */}
      <Cascade className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
        <CascadeItem className="rounded-2xl border border-line bg-bg p-6 md:p-8">
          <div className="mb-1 flex items-center gap-3">
            <IconChip>
              <Clapperboard className="h-4 w-4" strokeWidth={1.75} />
            </IconChip>
            <h2 className="text-base font-semibold">À tourner cette semaine</h2>
          </div>
          <p className="mb-6 text-xs text-muted">Les 3 prochaines vidéos de tes produits suivis. Coche-les une fois postées.</p>
          {data.upcoming.length ? (
            <UpcomingList items={data.upcoming} />
          ) : (
            <EmptyState
              title={data.hasBoards ? 'Rien de prévu d’ici dimanche' : 'Aucune vidéo à tourner'}
              action={
                data.hasBoards ? (
                  <LinkButton href={data.planningEnabled ? '/app/plan' : '/app/mes-produits'} variant="secondary">
                    {data.planningEnabled ? 'Ouvrir mon plan' : 'Ouvrir mes produits'}
                  </LinkButton>
                ) : (
                  <LinkButton href="/app/radar" variant="secondary">
                    Suivre un produit
                  </LinkButton>
                )
              }
            >
              {data.hasBoards
                ? 'Tes prochaines vidéos sont prévues plus tard. Avance-les dans ton plan si tu veux tourner plus.'
                : 'Suis un produit depuis le radar : son tableau de 20 vidéos se crée tout seul.'}
            </EmptyState>
          )}
        </CascadeItem>

        <CascadeItem className="rounded-2xl border border-line bg-bg p-6 md:p-8">
          <div className="mb-1 flex items-center gap-3">
            <IconChip tone="neutral">
              <Target className="h-4 w-4" strokeWidth={1.75} />
            </IconChip>
            <h2 className="text-base font-semibold">Objectif du mois</h2>
          </div>
          <p className="mb-6 text-xs text-muted">Ton objectif personnel de gains : un repère, pas une promesse.</p>
          {data.goalCents ? (
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <ProgressRing
                ratio={data.earningsEnabled ? (progress?.ratio ?? 0) : 0}
                label={`${formatEuros(data.monthGains)} sur un objectif de ${formatEuros(data.goalCents)}`}
              >
                <span className="text-2xl font-bold tabular-nums">{data.earningsEnabled ? Math.round((progress?.ratio ?? 0) * 100) : 0} %</span>
                <span className="text-[11px] text-muted">de l’objectif</span>
              </ProgressRing>
              <div className="text-sm">
                <p>
                  <span className="text-2xl font-bold tabular-nums">{formatEuros(data.monthGains)}</span>
                  <span className="text-muted"> / {formatEuros(data.goalCents)}</span>
                </p>
                <p className="mt-2 text-muted">
                  {!data.earningsEnabled
                    ? 'Le suivi des gains est inclus dans Pro : saisis tes commissions pour voir ta progression.'
                    : progress && progress.leftCents > 0
                      ? `Encore ${formatEuros(progress.leftCents)} pour l’atteindre ce mois-ci.`
                      : 'Objectif atteint ce mois-ci. Bravo !'}
                </p>
                <Link href="/app/compte#objectifs" className="mt-3 inline-flex text-sm font-semibold text-cyan-ink hover:underline">
                  Changer mon objectif
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Fixe-toi un objectif"
              action={
                <LinkButton href="/app/compte#objectifs" variant="secondary">
                  Choisir mon objectif
                </LinkButton>
              }
            >
              Un montant de commissions à viser ce mois-ci. Tu le vois progresser ici, au fil de tes gains saisis.
            </EmptyState>
          )}
        </CascadeItem>
      </Cascade>

      {/* Produits suivis + activité */}
      <Cascade className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
        <CascadeItem className="rounded-2xl border border-line bg-bg p-6 md:p-8">
          <div className="mb-1 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconChip>
                <Star className="h-4 w-4" strokeWidth={1.75} />
              </IconChip>
              <h2 className="text-base font-semibold">Produits suivis</h2>
            </div>
            <Link href="/app/mes-produits" className="text-sm font-semibold text-cyan-ink hover:underline">
              Tout voir
            </Link>
          </div>
          <p className="mb-6 text-xs text-muted">Ventes des 7 derniers jours ; ceux qui baissent passent en tête.</p>
          {data.followed.length ? (
            <ul className="space-y-2">
              {data.followed.map(({ product: p, declining }) => (
                <li key={p.id}>
                  <Link
                    href={`/app/mes-produits/${encodeURIComponent(p.id)}`}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl border bg-bg px-4 py-3 transition-colors',
                      declining ? 'border-warn/40 hover:border-warn/60' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className={cn('text-xs', declining ? 'font-semibold text-warn' : 'text-muted')}>
                        {declining ? 'En baisse : pense à le remplacer' : `${formatInt(p.sales_30d.slice(-7).reduce((s, v) => s + v, 0))} ventes sur 7 jours`}
                      </span>
                    </span>
                    <Sparkline values={p.sales_30d.slice(-7)} width={72} height={26} tone={declining ? 'down' : 'up'} label={`Ventes sur 7 jours de ${p.name}`} />
                    {plan.showScore ? <span className="w-9 text-right text-sm font-bold tabular-nums">{p.latest_score}</span> : null}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-ink" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Tu ne suis encore aucun produit" action={<LinkButton href="/app/radar" variant="secondary">Ouvrir le radar</LinkButton>}>
              Suis les produits sur lesquels tu tournes : tu verras ici leurs ventes et une alerte s’ils baissent.
            </EmptyState>
          )}
        </CascadeItem>

        <CascadeItem className="rounded-2xl border border-line bg-bg p-6 md:p-8">
          <div className="mb-1 flex items-center gap-3">
            <IconChip tone="neutral">
              <History className="h-4 w-4" strokeWidth={1.75} />
            </IconChip>
            <h2 className="text-base font-semibold">Activité récente</h2>
          </div>
          <p className="mb-6 text-xs text-muted">Tes derniers scripts, vidéos postées, gains saisis et alertes.</p>
          {data.activity.length ? (
            <ul className="space-y-1">
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
            <EmptyState title="Rien pour l’instant" action={product ? <LinkButton href={`/app/studio?produit=${encodeURIComponent(product.id)}`} variant="secondary">Écrire mes premiers scripts</LinkButton> : null}>
              Tes scripts, tes vidéos postées et tes gains s’afficheront ici, du plus récent au plus ancien.
            </EmptyState>
          )}
        </CascadeItem>
      </Cascade>

      {/* Raccourcis */}
      <section aria-labelledby="raccourcis">
        <SectionTitle id="raccourcis">Raccourcis</SectionTitle>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3">
          {[
            { label: 'Radar du jour', href: '/app/radar', icon: RadarIcon },
            { label: 'Studio de scripts', href: '/app/studio', icon: PenLine },
            { label: 'Mes produits', href: '/app/mes-produits', icon: Star },
            { label: 'Mes gains', href: '/app/gains', icon: Euro },
          ].map((item, idx) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-bg px-4 py-4 text-left transition-all hover:border-cyan-ink/25 hover:bg-cyan-ink/5"
            >
              <span className="flex min-w-0 items-center gap-3">
                <IconChip size="lg" tone={idx % 2 === 0 ? 'cyan' : 'neutral'}>
                  <item.icon className={cn('h-[18px] w-[18px]', idx % 2 === 0 ? 'text-cyan-ink' : 'text-muted')} strokeWidth={1.75} />
                </IconChip>
                <span className="truncate text-sm font-medium text-fg/85 group-hover:text-fg">{item.label}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-ink" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

