'use client';

import {
  BadgeCheck,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Download,
  ExternalLink,
  Euro,
  Eye,
  Home,
  Lock,
  Package,
  Pencil,
  Plus,
  Radar,
  Search,
  Send,
  Store,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  deleteSampleAction,
  followUpSampleAction,
  receiveSampleAction,
  requestSampleAction,
  saveVideoAction,
  setStageAction,
} from '@/app/app/gestionnaire/actions';
import { addEarningAction, deleteEarningAction, setEarningsGoalAction, startImportAction } from '@/app/app/gestionnaire/commissions-actions';
import { tooltipStyle, useChartColors } from '@/components/charts/colors';
import { ProductImage } from '@/components/product/product-image';
import { LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import {
  annualSeries,
  byDay,
  managerKpis,
  nextStage,
  PIPELINE_STATUSES,
  STAGE_LABELS,
  type ManagerData,
  type ManagerVideo,
  type ProductStage,
  type StatsRange,
} from '@/lib/v2/manager';
import { cn, formatCompact, formatEuros, formatInt, formatShortDate } from '@/lib/utils';
import { fieldClass, KpiCard, labelClass, Modal, ModalFooter, panelClass, Pills, STAGE_TONES, useStageColors } from './manager-ui';

export type ManagerTab = 'produits' | 'echantillons' | 'videos' | 'commissions' | 'calendrier';

export const MANAGER_TABS: Array<{ id: ManagerTab; label: string }> = [
  { id: 'produits', label: 'Produits en cours' },
  { id: 'echantillons', label: 'Échantillons' },
  { id: 'videos', label: 'Vidéos' },
  { id: 'commissions', label: 'Commissions' },
  { id: 'calendrier', label: 'Calendrier' },
];

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

type ModalKind = null | 'commission' | 'import' | 'echantillon' | 'video' | { video: ManagerVideo };

/**
 * Onglets du gestionnaire (repris du gestionnaire de boutique d'EtSmart), dans le tableau de bord : produits en cours
 * avec leur statut, échantillons, vidéos, commissions et calendrier, avec leurs fenêtres modales. Les chiffres et le
 * graphique sont au-dessus, une seule fois, dans le tableau de bord.
 */
export function ManagerTabs({ data, initialTab, flash }: { data: ManagerData; initialTab: ManagerTab; flash: ReactFlash }) {
  const [tab, setTab] = useState<ManagerTab>(initialTab);
  const [modal, setModal] = useState<ModalKind>(null);
  const filtre = '';

  return (
    <section id="gestion" aria-label="Gestion" className="scroll-mt-24">
      {flash ? <Flash flash={flash} /> : null}
      <div className="mb-5 overflow-x-auto">
        <Pills label="Sections du gestionnaire" items={MANAGER_TABS} value={tab} onChange={setTab} className="w-max" />
      </div>

      {data.products.length === 0 && tab !== 'commissions' ? (
        <div className={cn(panelClass, 'flex flex-col items-center justify-center gap-4 py-14 text-center text-muted')}>
          <Store className="h-14 w-14 text-fg/15" aria-hidden="true" />
          <p className="font-semibold text-fg">Suis un produit depuis le radar</p>
          <LinkButton href="/app/radar" arrow>
            Ouvrir le radar
          </LinkButton>
        </div>
      ) : null}

      {tab === 'produits' && data.products.length ? <ProductsTab data={data} filtre={filtre} /> : null}
      {tab === 'echantillons' && data.products.length ? (
        <SamplesTab data={data} productId={null} filtre={filtre} onNew={() => setModal('echantillon')} />
      ) : null}
      {tab === 'videos' && data.products.length ? (
        <VideosTab data={data} productId={null} onNew={() => setModal('video')} onEdit={(video) => setModal({ video })} />
      ) : null}
      {tab === 'commissions' ? (
        <CommissionsTab data={data} productId={null} filtre={filtre} onNew={() => setModal('commission')} onImport={() => setModal('import')} />
      ) : null}
      {tab === 'calendrier' && data.products.length ? <CalendarTab data={data} productId={null} /> : null}

      <CommissionModal open={modal === 'commission'} onClose={() => setModal(null)} data={data} productId={null} />
      <ImportModal open={modal === 'import'} onClose={() => setModal(null)} />
      <SampleModal open={modal === 'echantillon'} onClose={() => setModal(null)} data={data} productId={null} filtre={filtre} />
      <VideoModal
        open={modal === 'video' || (typeof modal === 'object' && modal !== null)}
        onClose={() => setModal(null)}
        data={data}
        productId={null}
        filtre={filtre}
        video={typeof modal === 'object' && modal !== null ? modal.video : null}
      />
    </section>
  );
}

export type ReactFlash = { tone: 'ok' | 'erreur'; message: string } | null;

function Flash({ flash }: { flash: NonNullable<ReactFlash> }) {
  return (
    <p
      role="status"
      className={cn(
        'mb-4 animate-fade-up rounded-xl border px-4 py-2.5 text-sm font-medium motion-reduce:animate-none',
        flash.tone === 'ok' ? 'border-gain/25 bg-gain-soft text-gain' : 'border-rose/30 bg-rose-soft text-rose-ink',
      )}
    >
      {flash.message}
    </p>
  );
}

function Hidden({ filtre, tab }: { filtre: string; tab?: string }) {
  return (
    <>
      <input type="hidden" name="filtre" value={filtre} />
      {tab ? <input type="hidden" name="onglet" value={tab} /> : null}
    </>
  );
}

/** Pastille de statut cliquable : passe au statut suivant (comme les commandes d'EtSmart). */
function StageChip({ productId, stage, filtre, tab }: { productId: string; stage: ProductStage; filtre: string; tab: string }) {
  const next = nextStage(stage);
  return (
    <form action={setStageAction}>
      <Hidden filtre={filtre} tab={tab} />
      <input type="hidden" name="produit" value={productId} />
      <input type="hidden" name="statut" value={next} />
      <button
        type="submit"
        title={`Passer à « ${STAGE_LABELS[next]} »`}
        aria-label={`${STAGE_LABELS[stage]} : passer à « ${STAGE_LABELS[next]} »`}
        className={cn(
          'inline-flex w-fit select-none whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold transition-shadow hover:ring-1 hover:ring-fg/20',
          STAGE_TONES[stage],
        )}
      >
        {STAGE_LABELS[stage]}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Produits en cours
// ---------------------------------------------------------------------------------------------------------------------

function ProductsTab({ data, filtre }: { data: ManagerData; filtre: string }) {
  return (
    <div className={panelClass}>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-xs sm:text-sm">
          <thead className="border-b border-line bg-fg/[0.04] text-muted">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">Produit</th>
              <th className="px-3 py-2.5 text-left font-medium">Statut</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">Vidéos</th>
              <th className="px-3 py-2.5 text-right font-medium">Vues</th>
              <th className="px-3 py-2.5 text-right font-medium">Ventes</th>
              <th className="px-3 py-2.5 text-right font-medium">Commissions</th>
            </tr>
          </thead>
          <tbody>
            {data.products.map((p) => (
              <tr key={p.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-fg/[0.03]">
                <td className="px-3 py-2.5">
                  <Link href={`/app/mes-produits/${encodeURIComponent(p.id)}`} className="flex min-w-[12rem] items-center gap-3 hover:text-cyan-ink">
                    <ProductImage src={p.image} fallback={p.fallback} alt="" className="h-10 w-10 rounded-xl" />
                    <span className="line-clamp-2 font-medium">{p.name}</span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <StageChip productId={p.id} stage={p.stage} filtre={filtre} tab="produits" />
                </td>
                <td className="num whitespace-nowrap px-3 py-2.5 text-right">
                  {p.videosPosted} / {p.videosGoal}
                </td>
                <td className="num px-3 py-2.5 text-right text-muted">{p.views ? formatCompact(p.views) : '—'}</td>
                <td className="num px-3 py-2.5 text-right text-muted">{p.videoSales ? formatInt(p.videoSales) : '—'}</td>
                <td className="num px-3 py-2.5 text-right font-semibold text-gain">
                  {data.canEarnings ? (
                    p.commissionsCents ? (
                      formatEuros(p.commissionsCents)
                    ) : (
                      '—'
                    )
                  ) : (
                    <Lock className="ml-auto h-3.5 w-3.5 text-subtle" aria-label="Inclus dans Pro" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Échantillons
// ---------------------------------------------------------------------------------------------------------------------

function SamplesTab({ data, productId, filtre, onNew }: { data: ManagerData; productId: string | null; filtre: string; onNew: () => void }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'tous' | 'attente' | 'recus'>('tous');
  const images = new Map(data.products.map((p) => [p.id, p]));
  const rows = data.samples.filter(
    (s) =>
      (!productId || s.product_id === productId) &&
      (status === 'tous' || (status === 'recus' ? Boolean(s.received_at) : !s.received_at)) &&
      (!search || s.product_name.toLowerCase().includes(search.toLowerCase()) || (s.note ?? '').toLowerCase().includes(search.toLowerCase())),
  );
  return (
    <div className={panelClass}>
      <h3 className="mb-0.5 text-sm font-semibold">Échantillons</h3>
      <p className="mb-4 text-xs text-muted">Demandes, relances et réceptions</p>
      <Toolbar search={search} onSearch={setSearch} placeholder="Chercher un produit ou une note">
        <FilterSelect
          value={status}
          onChange={(v) => setStatus(v as typeof status)}
          label="Statut"
          options={[
            ['tous', 'Tous'],
            ['attente', 'En attente'],
            ['recus', 'Reçus'],
          ]}
        />
        <PrimaryAdd onClick={onNew}>Nouvelle demande</PrimaryAdd>
      </Toolbar>
      {rows.length === 0 ? (
        <Empty
          icon={<Send className="h-6 w-6" />}
          title={data.samples.length ? 'Aucune demande avec ces filtres' : 'Aucune demande d’échantillon'}
          action={<PrimaryAdd onClick={onNew}>Nouvelle demande</PrimaryAdd>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-fg/[0.04]">
              <tr className="text-left text-muted">
                <th className="px-4 py-3.5 font-semibold">Produit</th>
                <th className="px-4 py-3.5 font-semibold">Demandé le & statut</th>
                <th className="px-4 py-3.5 font-semibold">Relances</th>
                <th className="px-4 py-3.5 font-semibold">Note</th>
                <th className="w-40 px-4 py-3.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const p = images.get(s.product_id);
                return (
                  <tr key={s.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-fg/[0.03]">
                    <td className="px-4 py-3.5">
                      <span className="flex min-w-[10rem] items-center gap-3">
                        {p ? <ProductImage src={p.image} fallback={p.fallback} alt="" className="h-9 w-9 rounded-xl" /> : null}
                        <span className="line-clamp-2 font-medium">{s.product_name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex flex-col gap-0.5">
                        <span className="num whitespace-nowrap">{formatShortDate(s.requested_at)}</span>
                        <span
                          className={cn(
                            'inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium',
                            s.received_at ? 'bg-gain-soft text-gain' : s.late ? 'bg-rose-soft text-rose-ink' : 'bg-warn-soft text-warn',
                          )}
                        >
                          {s.received_at ? `Reçu le ${formatShortDate(s.received_at)}` : s.late ? 'À relancer' : 'En attente'}
                        </span>
                      </span>
                    </td>
                    <td className="num px-4 py-3.5 text-muted">
                      {s.follow_ups.length ? `${s.follow_ups.length} · ${formatShortDate(s.follow_ups.at(-1)!)}` : '—'}
                    </td>
                    <td className="max-w-[14rem] px-4 py-3.5 text-muted">
                      <span className="line-clamp-2">{s.note ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        {!s.received_at ? (
                          <>
                            <IconAction action={followUpSampleAction} id={s.id} filtre={filtre} label="Relancer" icon={<Send className="h-3.5 w-3.5" />} />
                            <IconAction
                              action={receiveSampleAction}
                              id={s.id}
                              filtre={filtre}
                              label="Marquer comme reçu"
                              icon={<BadgeCheck className="h-3.5 w-3.5" />}
                              tone="gain"
                            />
                          </>
                        ) : null}
                        <IconAction
                          action={deleteSampleAction}
                          id={s.id}
                          filtre={filtre}
                          label="Supprimer"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          tone="danger"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Vidéos
// ---------------------------------------------------------------------------------------------------------------------

function VideosTab({ data, productId, onNew, onEdit }: { data: ManagerData; productId: string | null; onNew: () => void; onEdit: (v: ManagerVideo) => void }) {
  const [search, setSearch] = useState('');
  const images = new Map(data.products.map((p) => [p.id, p]));
  const rows = data.videos.filter(
    (v) =>
      (!productId || v.productId === productId) && (!search || v.productName.toLowerCase().includes(search.toLowerCase()) || (v.url ?? '').includes(search)),
  );
  return (
    <div className={panelClass}>
      <h3 className="mb-0.5 text-sm font-semibold">Vidéos</h3>
      <p className="mb-4 text-xs text-muted">Tes vidéos en ligne, avec leurs vues et leurs ventes</p>
      <Toolbar search={search} onSearch={setSearch} placeholder="Chercher un produit ou un lien">
        <PrimaryAdd onClick={onNew}>Ajouter une vidéo</PrimaryAdd>
      </Toolbar>
      {rows.length === 0 ? (
        <Empty
          icon={<Video className="h-6 w-6" />}
          title={data.videos.length ? 'Aucune vidéo avec ces filtres' : 'Aucune vidéo en ligne'}
          action={<PrimaryAdd onClick={onNew}>Ajouter une vidéo</PrimaryAdd>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-fg/[0.04]">
              <tr className="text-left text-muted">
                <th className="px-4 py-3.5 font-semibold">Date</th>
                <th className="px-4 py-3.5 font-semibold">Produit</th>
                <th className="px-4 py-3.5 font-semibold">Lien</th>
                <th className="px-4 py-3.5 text-right font-semibold">Vues</th>
                <th className="px-4 py-3.5 text-right font-semibold">Ventes</th>
                <th className="w-20 px-4 py-3.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const p = images.get(v.productId);
                return (
                  <tr key={`${v.productId}-${v.n}`} className="border-b border-line/60 transition-colors last:border-0 hover:bg-fg/[0.03]">
                    <td className="num whitespace-nowrap px-4 py-3.5">{v.postedAt ? formatShortDate(v.postedAt) : '—'}</td>
                    <td className="px-4 py-3.5">
                      <span className="flex min-w-[10rem] items-center gap-3">
                        {p ? <ProductImage src={p.image} fallback={p.fallback} alt="" className="h-9 w-9 rounded-xl" /> : null}
                        <span>
                          <span className="line-clamp-1 font-medium">{v.productName}</span>
                          <span className="num text-xs text-muted">Vidéo {v.n}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {v.url ? (
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-cyan-ink hover:underline"
                        >
                          Ouvrir
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="num px-4 py-3.5 text-right">{v.views !== null ? formatCompact(v.views) : '—'}</td>
                    <td className="num px-4 py-3.5 text-right font-semibold text-gain">{v.sales !== null ? formatInt(v.sales) : '—'}</td>
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => onEdit(v)}
                        className="rounded p-1.5 text-muted hover:bg-fg/[0.06] hover:text-fg"
                        aria-label={`Modifier la vidéo ${v.n} de ${v.productName}`}
                        title="Modifier"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Commissions (ancien « Mes gains »)
// ---------------------------------------------------------------------------------------------------------------------

function CommissionsTab({
  data,
  productId,
  filtre,
  onNew,
  onImport,
}: {
  data: ManagerData;
  productId: string | null;
  filtre: string;
  onNew: () => void;
  onImport: () => void;
}) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'tous' | 'saisie' | 'import'>('tous');
  if (!data.canEarnings) {
    return (
      <div className={cn(panelClass, 'flex flex-col items-center gap-4 py-14 text-center')}>
        <span className="rounded-2xl border border-cyan-ink/30 bg-cyan-ink/10 p-3 text-cyan-ink">
          <Euro className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="font-semibold">Le suivi des commissions est inclus dans Pro.</p>
        <LinkButton href="/app/passer-pro" arrow>
          Passer à Pro
        </LinkButton>
      </div>
    );
  }
  const month = data.today.slice(0, 7);
  const monthCents = data.earnings.filter((e) => e.date.slice(0, 7) === month).reduce((s, e) => s + e.amountCents, 0);
  const goal = data.goalCents;
  const pct = goal ? Math.min(100, Math.round((monthCents / goal) * 100)) : 0;
  const rows = data.earnings.filter(
    (e) =>
      (!productId || e.productId === productId) &&
      (source === 'tous' || e.source === source) &&
      (!search || e.productName.toLowerCase().includes(search.toLowerCase()) || (e.video ?? '').toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <>
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className={panelClass} id="objectif-mois">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Ce mois-ci</p>
          <p className="num mt-2 text-3xl font-bold tracking-tight text-gain">{formatEuros(monthCents)}</p>
          {goal ? (
            <>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-fg/[0.07]"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Objectif du mois"
              >
                <div
                  className="h-full origin-left animate-grow-x rounded-full bg-[image:var(--gradient)] motion-reduce:animate-none"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="num mt-1.5 text-xs text-muted">
                {pct} % de ton objectif de {formatEuros(goal)}
              </p>
            </>
          ) : null}
          <form action={setEarningsGoalAction} className="mt-4 flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className={labelClass}>Objectif du mois</span>
              <input
                name="objectif"
                inputMode="decimal"
                defaultValue={goal ? String(goal / 100).replace('.', ',') : ''}
                placeholder="ex. 500"
                className={fieldClass}
              />
            </label>
            <SubmitButton size="md" variant="outline" pendingLabel="…" className="h-[46px]">
              Enregistrer
            </SubmitButton>
          </form>
        </div>
        <div className={cn(panelClass, 'flex flex-col justify-between gap-4')}>
          <div>
            <h3 className="text-sm font-semibold">Ajouter des commissions</h3>
            <p className="mt-0.5 text-xs text-muted">À la main, ou depuis le relevé exporté de TikTok Shop</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onNew}
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-cyan-ink/50 bg-cyan-ink/15 px-4 py-3 font-medium text-cyan-ink shadow-lg shadow-cyan-ink/5 transition-all hover:border-cyan-ink/60 hover:bg-cyan-ink/25"
            >
              <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
              Nouvelle commission
            </button>
            <button
              type="button"
              onClick={onImport}
              className="flex items-center justify-center gap-2 rounded-xl border border-line-strong px-5 py-3 font-medium transition-colors hover:bg-fg/[0.04]"
            >
              <Upload className="h-[18px] w-[18px]" aria-hidden="true" />
              Importer un CSV
            </button>
          </div>
          {data.earnings.length ? (
            <a href="/api/gains/export" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
              <Download className="h-4 w-4" aria-hidden="true" />
              Exporter en CSV
            </a>
          ) : null}
        </div>
      </div>

      <div className={panelClass} id="lignes">
        <h3 className="mb-0.5 text-sm font-semibold">Commissions</h3>
        <p className="mb-4 text-xs text-muted">Chaque ligne saisie ou importée</p>
        <Toolbar search={search} onSearch={setSearch} placeholder="Chercher un produit ou une vidéo">
          <FilterSelect
            value={source}
            onChange={(v) => setSource(v as typeof source)}
            label="Origine"
            options={[
              ['tous', 'Toutes'],
              ['saisie', 'Saisies'],
              ['import', 'Importées'],
            ]}
          />
        </Toolbar>
        {rows.length === 0 ? (
          <Empty
            icon={<Euro className="h-6 w-6" />}
            title={data.earnings.length ? 'Aucune commission avec ces filtres' : 'Aucune commission pour l’instant'}
            action={<PrimaryAdd onClick={onNew}>Nouvelle commission</PrimaryAdd>}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-fg/[0.04]">
                <tr className="text-left text-muted">
                  <th className="px-4 py-3.5 font-semibold">Date</th>
                  <th className="px-4 py-3.5 font-semibold">Produit</th>
                  <th className="px-4 py-3.5 font-semibold">Vidéo</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Ventes</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Montant</th>
                  <th className="w-16 px-4 py-3.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((e) => (
                  <tr key={e.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-fg/[0.03]">
                    <td className="px-4 py-3.5">
                      <span className="flex flex-col gap-0.5">
                        <span className="num whitespace-nowrap">{formatShortDate(e.date)}</span>
                        <span
                          className={cn(
                            'inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium',
                            e.source === 'import' ? 'bg-cyan-soft text-cyan-ink' : 'bg-fg/[0.06] text-muted',
                          )}
                        >
                          {e.source === 'import' ? 'Importée' : 'Saisie'}
                        </span>
                      </span>
                    </td>
                    <td className="max-w-[14rem] px-4 py-3.5">
                      <span className="line-clamp-2 font-medium">{e.productName}</span>
                    </td>
                    <td className="max-w-[12rem] px-4 py-3.5 text-muted">
                      <span className="line-clamp-1">{e.video ?? '—'}</span>
                    </td>
                    <td className="num px-4 py-3.5 text-right text-muted">{e.sales ?? '—'}</td>
                    <td className="num whitespace-nowrap px-4 py-3.5 text-right font-semibold text-gain">+{formatEuros(e.amountCents)}</td>
                    <td className="px-4 py-3.5">
                      <IconAction
                        action={deleteEarningAction}
                        id={e.id}
                        filtre={filtre}
                        label="Supprimer"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        tone="danger"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Calendrier
// ---------------------------------------------------------------------------------------------------------------------

function CalendarTab({ data, productId }: { data: ManagerData; productId: string | null }) {
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const days = useMemo(() => byDay(data, productId), [data, productId]);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // lundi en premier
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<number | null> = [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  const shift = (delta: number) => {
    setMonth(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7));
    setSelected(null);
  };
  const info = selected ? days[selected] : null;

  return (
    <div className={panelClass}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="mb-0.5 text-sm font-semibold">Calendrier</h3>
          <p className="text-xs text-muted">Tes vidéos, échantillons et commissions, jour par jour</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-gain" aria-hidden="true" /> Commission
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-ink" aria-hidden="true" /> Vidéo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warn" aria-hidden="true" /> Échantillon
          </span>
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <button type="button" onClick={() => shift(-1)} className="rounded-lg px-2 py-1 text-muted hover:bg-fg/[0.06]" aria-label="Mois précédent">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="font-medium">
          {MONTHS[m - 1]} {y}
        </span>
        <button type="button" onClick={() => shift(1)} className="rounded-lg px-2 py-1 text-muted hover:bg-fg/[0.06]" aria-label="Mois suivant">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 text-[11px] text-muted" aria-hidden="true">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
          <div key={d} className="py-1 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-7 gap-1 text-sm">
        {cells.map((day, i) => {
          if (!day) return <div key={`vide-${i}`} className="h-12 sm:h-14" />;
          const key = `${month}-${String(day).padStart(2, '0')}`;
          const d = days[key];
          const active = selected === key;
          const busy = Boolean(d);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              aria-pressed={active}
              className={cn(
                'flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border text-xs transition-all sm:h-14',
                active
                  ? 'border-cyan-ink bg-cyan-ink/15 text-fg'
                  : busy
                    ? 'border-cyan-ink/30 bg-cyan-ink/[0.06]'
                    : 'border-line bg-fg/[0.02] text-muted hover:border-line-strong',
                key === data.today && 'font-bold text-fg',
              )}
            >
              <span>{day}</span>
              {d && data.canEarnings && d.commissionsCents ? (
                <span className="num hidden text-[10px] font-semibold text-gain sm:inline">+{Math.round(d.commissionsCents / 100)} €</span>
              ) : null}
              {d ? (
                <span className="sr-only">
                  {' '}
                  {MONTHS[m - 1]} :{' '}
                  {[
                    d.commissionsCents && data.canEarnings ? formatEuros(d.commissionsCents) : null,
                    d.videos.length ? `${d.videos.length} vidéo${d.videos.length > 1 ? 's' : ''}` : null,
                    d.requested.length + d.received.length ? 'échantillon' : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              ) : (
                <span className="sr-only"> {MONTHS[m - 1]}</span>
              )}
              {d ? (
                <span className="flex gap-0.5" aria-hidden="true">
                  {d.commissionsCents && data.canEarnings ? <span className="h-1.5 w-1.5 rounded-full bg-gain sm:hidden" /> : null}
                  {d.videos.length ? <span className="h-1.5 w-1.5 rounded-full bg-cyan-ink" /> : null}
                  {d.requested.length + d.received.length ? <span className="h-1.5 w-1.5 rounded-full bg-warn" /> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="space-y-2 rounded-xl border border-line bg-fg/[0.02] p-4 text-sm" aria-live="polite">
          <p className="font-semibold">{formatShortDate(selected)}</p>
          {!info ? <p className="text-muted">Rien ce jour-là.</p> : null}
          {info && data.canEarnings
            ? info.earnings.map((e) => (
                <p key={e.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <Euro className="h-4 w-4 text-gain" aria-hidden="true" />
                    {e.productName}
                  </span>
                  <span className="num font-semibold text-gain">+{formatEuros(e.amountCents)}</span>
                </p>
              ))
            : null}
          {info?.videos.map((v) => (
            <p key={`${v.productId}-${v.n}`} className="flex items-center gap-2">
              <Clapperboard className="h-4 w-4 text-cyan-ink" aria-hidden="true" />
              Vidéo {v.n} · {v.productName}
              {v.views !== null ? (
                <span className="num ml-auto flex items-center gap-1 text-muted">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatCompact(v.views)}
                </span>
              ) : null}
            </p>
          ))}
          {info?.requested.map((s) => (
            <p key={`d-${s.id}`} className="flex items-center gap-2">
              <Send className="h-4 w-4 text-warn" aria-hidden="true" />
              Échantillon demandé · {s.product_name}
            </p>
          ))}
          {info?.received.map((s) => (
            <p key={`r-${s.id}`} className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-gain" aria-hidden="true" />
              Échantillon reçu · {s.product_name}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Petits éléments communs
// ---------------------------------------------------------------------------------------------------------------------

function Toolbar({
  search,
  onSearch,
  placeholder,
  children,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label className="relative min-w-[220px] flex-1">
        <span className="sr-only">{placeholder}</span>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-line bg-fg/[0.03] py-2.5 pl-10 pr-4 text-sm placeholder:text-subtle transition-all focus:border-cyan-ink/50 focus:outline-none focus:ring-1 focus:ring-cyan-ink/20"
        />
      </label>
      {children}
    </div>
  );
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: Array<[string, string]> }) {
  return (
    <label className="flex items-center gap-2">
      <span className="hidden text-[11px] uppercase tracking-wide text-subtle sm:inline">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="cursor-pointer appearance-none rounded-xl border border-cyan-ink/40 bg-raised py-2.5 pl-3 pr-8 text-xs shadow-sm shadow-cyan-ink/10 focus:border-cyan-ink/60 focus:outline-none focus:ring-1 focus:ring-cyan-ink/30 sm:text-sm"
        >
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-ink/70" aria-hidden="true" />
      </span>
    </label>
  );
}

function PrimaryAdd({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-cyan-ink/50 bg-cyan-ink/15 px-5 py-2.5 font-medium text-cyan-ink shadow-lg shadow-cyan-ink/5 transition-all hover:border-cyan-ink/60 hover:bg-cyan-ink/25"
    >
      <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
      {children}
    </button>
  );
}

function Empty({ icon, title, action }: { icon: React.ReactNode; title: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong py-12 text-center">
      <span className="rounded-2xl border border-cyan-ink/30 bg-cyan-ink/10 p-3 text-cyan-ink">{icon}</span>
      <p className="font-semibold">{title}</p>
      {action}
    </div>
  );
}

function IconAction({
  action,
  id,
  filtre,
  label,
  icon,
  tone,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  filtre: string;
  label: string;
  icon: React.ReactNode;
  tone?: 'gain' | 'danger';
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="filtre" value={filtre} />
      <button
        type="submit"
        title={label}
        aria-label={label}
        className={cn(
          'rounded p-1.5 text-muted transition-colors',
          tone === 'danger'
            ? 'hover:bg-rose-soft hover:text-rose-ink'
            : tone === 'gain'
              ? 'hover:bg-gain-soft hover:text-gain'
              : 'hover:bg-fg/[0.06] hover:text-fg',
        )}
      >
        {icon}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Fenêtres modales
// ---------------------------------------------------------------------------------------------------------------------

function ProductSelect({
  data,
  productId,
  name = 'produit',
  required = true,
}: {
  data: ManagerData;
  productId: string | null;
  name?: string;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <select name={name} required={required} defaultValue={productId ?? ''} className={cn(fieldClass, 'appearance-none pr-10')}>
        <option value="" disabled>
          Choisis un produit
        </option>
        {data.products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
    </div>
  );
}

function CommissionModal({ open, onClose, data, productId }: { open: boolean; onClose: () => void; data: ManagerData; productId: string | null }) {
  const name = data.products.find((p) => p.id === productId)?.name ?? '';
  return (
    <Modal open={open} onClose={onClose} icon={<Euro />} title="Nouvelle commission" subtitle="Le montant que TikTok Shop t’a versé">
      <form action={addEarningAction}>
        <div className="space-y-5 p-6 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className={cn(labelClass, 'flex items-center gap-1.5')}>
                <Calendar className="h-3 w-3 text-cyan-ink" aria-hidden="true" /> Date
              </span>
              <input type="date" name="date" required defaultValue={data.today} max={data.today} className={fieldClass} />
            </label>
            <label>
              <span className={labelClass}>Montant (€)</span>
              <input name="montant" required inputMode="decimal" placeholder="ex. 42,50" className={fieldClass} />
            </label>
          </div>
          <label className="block">
            <span className={labelClass}>Produit</span>
            <input name="produit" required list="gestionnaire-produits" defaultValue={name} placeholder="Nom du produit" className={fieldClass} />
            <datalist id="gestionnaire-produits">
              {data.products.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className={labelClass}>Vidéo (facultatif)</span>
              <input name="video" placeholder="Lien ou titre" className={fieldClass} />
            </label>
            <label>
              <span className={labelClass}>Ventes (facultatif)</span>
              <input name="ventes" inputMode="numeric" placeholder="ex. 3" className={fieldClass} />
            </label>
          </div>
        </div>
        <ModalFooter onCancel={onClose}>
          <SubmitButton size="lg" pendingLabel="Ajout…" className="h-auto flex-1 py-3.5">
            Ajouter la commission
          </SubmitButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} icon={<Upload />} title="Importer un CSV" subtitle="Le relevé exporté de TikTok Shop, ou ton tableur">
      <form action={startImportAction}>
        <div className="space-y-4 p-6 pt-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center transition-colors hover:border-cyan-ink/40 hover:bg-cyan-ink/[0.04]">
            <Upload className="h-6 w-6 text-cyan-ink" aria-hidden="true" />
            <span className="text-sm font-semibold">Choisis ton fichier CSV</span>
            <input
              type="file"
              name="fichier"
              accept=".csv,text/csv,text/plain"
              required
              className="text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-fg/[0.06] file:px-3 file:py-1.5 file:text-sm file:font-semibold"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="revoir" className="h-4 w-4 rounded border-line accent-[rgb(var(--cyan-ink))]" />
            Choisir les colonnes à nouveau
          </label>
        </div>
        <ModalFooter onCancel={onClose}>
          <SubmitButton size="lg" pendingLabel="Lecture…" className="h-auto flex-1 py-3.5">
            Importer
          </SubmitButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function SampleModal({
  open,
  onClose,
  data,
  productId,
  filtre,
}: {
  open: boolean;
  onClose: () => void;
  data: ManagerData;
  productId: string | null;
  filtre: string;
}) {
  return (
    <Modal open={open} onClose={onClose} icon={<Send />} title="Nouvelle demande" subtitle="Un échantillon demandé à une marque">
      <form action={requestSampleAction}>
        <Hidden filtre={filtre} />
        <div className="space-y-5 p-6 pt-4">
          <label className="block">
            <span className={labelClass}>Produit</span>
            <ProductSelect data={data} productId={productId} />
          </label>
          <label className="block">
            <span className={cn(labelClass, 'flex items-center gap-1.5')}>
              <Calendar className="h-3 w-3 text-cyan-ink" aria-hidden="true" /> Demandé le
            </span>
            <input type="date" name="date" defaultValue={data.today} max={data.today} className={fieldClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Note (facultatif)</span>
            <input name="note" maxLength={300} placeholder="Marque, contact, adresse donnée…" className={fieldClass} />
          </label>
        </div>
        <ModalFooter onCancel={onClose}>
          <SubmitButton size="lg" pendingLabel="Ajout…" className="h-auto flex-1 py-3.5">
            Ajouter la demande
          </SubmitButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function VideoModal({
  open,
  onClose,
  data,
  productId,
  filtre,
  video,
}: {
  open: boolean;
  onClose: () => void;
  data: ManagerData;
  productId: string | null;
  filtre: string;
  video: ManagerVideo | null;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Video />}
      title={video ? `Vidéo ${video.n}` : 'Ajouter une vidéo'}
      subtitle={video ? video.productName : 'Une vidéo en ligne, avec ses chiffres'}
    >
      <form action={saveVideoAction} key={video ? `${video.productId}-${video.n}` : 'nouvelle'}>
        <Hidden filtre={filtre} />
        {video ? (
          <>
            <input type="hidden" name="produit" value={video.productId} />
            <input type="hidden" name="n" value={video.n} />
          </>
        ) : null}
        <div className="space-y-5 p-6 pt-4">
          {!video ? (
            <label className="block">
              <span className={labelClass}>Produit</span>
              <ProductSelect data={data} productId={productId} />
            </label>
          ) : null}
          <label className="block">
            <span className={labelClass}>Lien de la vidéo</span>
            <input name="lien" type="url" inputMode="url" defaultValue={video?.url ?? ''} placeholder="https://www.tiktok.com/@…" className={fieldClass} />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label>
              <span className={labelClass}>Postée le</span>
              <input type="date" name="date" defaultValue={video?.postedAt ?? data.today} max={data.today} className={cn(fieldClass, 'px-3')} />
            </label>
            <label>
              <span className={labelClass}>Vues</span>
              <input name="vues" inputMode="numeric" defaultValue={video?.views ?? ''} placeholder="0" className={cn(fieldClass, 'px-3')} />
            </label>
            <label>
              <span className={labelClass}>Ventes</span>
              <input name="ventes" inputMode="numeric" defaultValue={video?.sales ?? ''} placeholder="0" className={cn(fieldClass, 'px-3')} />
            </label>
          </div>
        </div>
        <ModalFooter onCancel={onClose}>
          <SubmitButton size="lg" pendingLabel="Enregistrement…" className="h-auto flex-1 py-3.5">
            {video ? 'Enregistrer la vidéo' : 'Ajouter la vidéo'}
          </SubmitButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}
