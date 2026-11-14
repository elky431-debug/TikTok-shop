import type { Repo } from '@/lib/db';
import type { Product, UserRecord } from '@/lib/db/types';
import { fallbackImageUrl } from '@/lib/product-image';
import { displayName } from '@/lib/product-name';
import { commissionPerSale } from '@/lib/score';
import { listBoards } from './board';
import { EARNINGS_KIND, type EarningData } from './earnings';
import { getEarningsGoal } from './earnings-store';
import { planProgress, type PublicationPlan } from './planning';

/**
 * Gestionnaire (repris du gestionnaire de boutique d'EtSmart, adapté à un affilié TikTok Shop) : chaque produit suivi
 * avance d'un statut à l'autre, de l'échantillon demandé jusqu'à la vidéo en ligne. Rien n'est copié ailleurs : les
 * vidéos restent dans le tableau de publication (`publication`), les commissions dans les fiches `gain` de l'ancien
 * « Mes gains ». Seuls le statut de chaque produit et les échantillons sont de nouvelles fiches.
 */
export const PIPELINE_STATUSES = ['echantillon_demande', 'echantillon_recu', 'en_tournage', 'en_ligne', 'arrete'] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];
/** Statut affiché : un produit qu'on vient de suivre est « à lancer » tant qu'on ne lui en a pas donné. */
export type ProductStage = PipelineStatus | 'a_lancer';

export const STAGE_LABELS: Record<ProductStage, string> = {
  a_lancer: 'À lancer',
  echantillon_demande: 'Échantillon demandé',
  echantillon_recu: 'Échantillon reçu',
  en_tournage: 'En tournage',
  en_ligne: 'En ligne',
  arrete: 'Arrêté',
};

export const isPipelineStatus = (value: unknown): value is PipelineStatus => PIPELINE_STATUSES.includes(value as PipelineStatus);

export const TRACK_KIND = 'suivi_produit';
export const SAMPLE_KIND = 'echantillon';

export interface ProductTrack {
  product_id: string;
  status: PipelineStatus;
  /** Dates de passage d'un statut à l'autre (AAAA-MM-JJ). */
  history: Array<{ status: PipelineStatus; at: string }>;
}

export interface SampleData {
  product_id: string;
  product_name: string;
  /** AAAA-MM-JJ */
  requested_at: string;
  received_at: string | null;
  /** Dates des relances (AAAA-MM-JJ). */
  follow_ups: string[];
  note: string | null;
}

/** Délai après lequel une demande d'échantillon sans réponse mérite une relance. */
export const FOLLOW_UP_AFTER_DAYS = 7;

/** Statut suivant au clic sur la pastille (comme le statut des commandes dans EtSmart). */
export function nextStage(stage: ProductStage): PipelineStatus {
  if (stage === 'a_lancer') return 'echantillon_demande';
  const i = PIPELINE_STATUSES.indexOf(stage);
  return PIPELINE_STATUSES[(i + 1) % PIPELINE_STATUSES.length];
}

/** Statut d'un produit : celui choisi, sinon déduit des vidéos (postée → en ligne, tournée → en tournage). */
export function stageOf(track: ProductTrack | null, board: PublicationPlan | null): ProductStage {
  if (track) return track.status;
  if (!board) return 'a_lancer';
  const p = planProgress(board);
  if (p.posted > 0) return 'en_ligne';
  if (p.filmed > 0) return 'en_tournage';
  return 'a_lancer';
}

export function withStatus(track: ProductTrack | null, productId: string, status: PipelineStatus, today: string): ProductTrack {
  if (track?.status === status) return track;
  return { product_id: productId, status, history: [...(track?.history ?? []), { status, at: today }].slice(-30) };
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** Demande en attente depuis plus de 7 jours (ou 7 jours après la dernière relance) : à relancer. */
export function needsFollowUp(sample: SampleData, today: string): boolean {
  if (sample.received_at) return false;
  const last = sample.follow_ups.at(-1) ?? sample.requested_at;
  return daysBetween(last, today) >= FOLLOW_UP_AFTER_DAYS;
}

// ---------------------------------------------------------------------------------------------------------------------
// Vue du gestionnaire (données sérialisables pour le composant client)
// ---------------------------------------------------------------------------------------------------------------------

export interface ManagerProduct {
  id: string;
  name: string;
  image: string;
  fallback: string;
  priceCents: number;
  commissionPerSaleCents: number;
  stage: ProductStage;
  videosPosted: number;
  videosGoal: number;
  views: number;
  /** Ventes notées sur les vidéos. */
  videoSales: number;
  /** Commissions saisies ou importées pour ce produit (0 sans le suivi des gains). */
  commissionsCents: number;
}

export interface ManagerVideo {
  productId: string;
  productName: string;
  n: number;
  url: string | null;
  postedAt: string | null;
  views: number | null;
  sales: number | null;
}

export interface ManagerSample extends SampleData {
  id: string;
  late: boolean;
}

export interface ManagerEarning {
  id: string;
  date: string;
  productId: string | null;
  productName: string;
  video: string | null;
  amountCents: number;
  sales: number | null;
  source: EarningData['source'];
}

export interface ManagerData {
  today: string;
  products: ManagerProduct[];
  videos: ManagerVideo[];
  samples: ManagerSample[];
  earnings: ManagerEarning[];
  goalCents: number | null;
  /** Suivi des gains ouvert par le plan (Pro et plus). */
  canEarnings: boolean;
}

export async function loadManager(repo: Repo, userId: string, opts: { today: string; canEarnings: boolean }): Promise<ManagerData> {
  const [saved, boards, tracks, samples, earnings, goal] = await Promise.all([
    repo.listSavedProducts(userId),
    listBoards(repo, userId),
    repo.listRecords<ProductTrack>(userId, TRACK_KIND),
    repo.listRecords<SampleData>(userId, SAMPLE_KIND),
    opts.canEarnings ? repo.listRecords<EarningData>(userId, EARNINGS_KIND) : Promise.resolve([] as Array<UserRecord<EarningData>>),
    opts.canEarnings ? getEarningsGoal(repo, userId) : Promise.resolve({ id: null, cents: null }),
  ]);
  const catalog = new Map((await repo.getProducts(saved.map((s) => s.product_id))).map((p) => [p.id, p]));
  const trackBy = new Map(tracks.map((t) => [t.data.product_id, t.data]));
  const earnedBy = new Map<string, number>();
  for (const e of earnings) if (e.data.product_id) earnedBy.set(e.data.product_id, (earnedBy.get(e.data.product_id) ?? 0) + e.data.amount_cents);

  const products: ManagerProduct[] = [];
  const videos: ManagerVideo[] = [];
  for (const s of saved) {
    const product = catalog.get(s.product_id);
    if (!product) continue;
    const board = boards.get(product.id)?.data ?? null;
    const posted = board?.items.filter((i) => i.status === 'poste') ?? [];
    products.push(toManagerProduct(product, trackBy.get(product.id) ?? null, board, earnedBy.get(product.id) ?? 0));
    for (const item of posted) {
      videos.push({
        productId: product.id,
        productName: displayName(product),
        n: item.n,
        url: item.url,
        postedAt: item.posted_at ?? null,
        views: item.views ?? null,
        sales: item.sales ?? null,
      });
    }
  }
  const order: Record<ProductStage, number> = { en_tournage: 0, echantillon_recu: 1, echantillon_demande: 2, en_ligne: 3, a_lancer: 4, arrete: 5 };
  products.sort((a, b) => order[a.stage] - order[b.stage] || b.commissionsCents - a.commissionsCents);
  videos.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? '') || b.n - a.n);

  return {
    today: opts.today,
    products,
    videos,
    samples: samples
      .map((r) => ({ ...r.data, id: r.id, late: needsFollowUp(r.data, opts.today) }))
      .sort((a, b) => Number(Boolean(a.received_at)) - Number(Boolean(b.received_at)) || b.requested_at.localeCompare(a.requested_at)),
    earnings: earnings
      .map((r) => ({
        id: r.id,
        date: r.data.date,
        productId: r.data.product_id,
        productName: r.data.product_name,
        video: r.data.video,
        amountCents: r.data.amount_cents,
        sales: r.data.sales,
        source: r.data.source,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    goalCents: goal.cents,
    canEarnings: opts.canEarnings,
  };
}

function toManagerProduct(product: Product, track: ProductTrack | null, board: PublicationPlan | null, commissionsCents: number): ManagerProduct {
  const progress = board ? planProgress(board) : { posted: 0, total: 20 };
  const posted = board?.items.filter((i) => i.status === 'poste') ?? [];
  return {
    id: product.id,
    name: displayName(product),
    image: product.image_url,
    fallback: fallbackImageUrl(product.id, product.niche),
    priceCents: product.price_cents,
    commissionPerSaleCents: commissionPerSale(product.price_cents, product.commission_rate),
    stage: stageOf(track, board),
    videosPosted: progress.posted,
    videosGoal: progress.total,
    views: posted.reduce((s, i) => s + (i.views ?? 0), 0),
    videoSales: posted.reduce((s, i) => s + (i.sales ?? 0), 0),
    commissionsCents,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Chiffres par période (calculés côté client quand on change de période, comme dans EtSmart)
// ---------------------------------------------------------------------------------------------------------------------

export type StatsRange = '7d' | '30d' | 'month' | 'all';

export function inRange(date: string | null, range: StatsRange, today: string, month: string): boolean {
  if (!date) return false;
  if (range === 'all') return true;
  if (range === 'month') return date.slice(0, 7) === month;
  const days = range === '7d' ? 7 : 30;
  const diff = daysBetween(date, today);
  return diff >= 0 && diff < days;
}

export interface ManagerKpis {
  commissionsCents: number;
  sales: number;
  videos: number;
  samplesPending: number;
}

export function managerKpis(
  data: Pick<ManagerData, 'earnings' | 'videos' | 'samples' | 'today'>,
  range: StatsRange,
  month: string,
  productId: string | null,
): ManagerKpis {
  const keep = (id: string | null) => !productId || id === productId;
  const earnings = data.earnings.filter((e) => keep(e.productId) && inRange(e.date, range, data.today, month));
  const videos = data.videos.filter((v) => keep(v.productId) && inRange(v.postedAt, range, data.today, month));
  const earningSales = earnings.reduce((s, e) => s + (e.sales ?? 0), 0);
  return {
    commissionsCents: earnings.reduce((s, e) => s + e.amountCents, 0),
    // Ventes notées avec les commissions ; sans elles, celles notées sur les vidéos.
    sales: earningSales || videos.reduce((s, v) => s + (v.sales ?? 0), 0),
    videos: videos.length,
    samplesPending: data.samples.filter((s) => keep(s.product_id) && !s.received_at).length,
  };
}

/** Commissions et ventes par mois de l'année choisie (graphique « Évolution annuelle »). */
export function annualSeries(earnings: ManagerEarning[], year: number, productId: string | null) {
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const rows = months.map((month) => ({ month, commissions: 0, ventes: 0 }));
  for (const e of earnings) {
    if (productId && e.productId !== productId) continue;
    if (Number(e.date.slice(0, 4)) !== year) continue;
    const row = rows[Number(e.date.slice(5, 7)) - 1];
    if (!row) continue;
    row.commissions = Math.round(row.commissions * 100 + e.amountCents) / 100;
    row.ventes += e.sales ?? 0;
  }
  return rows;
}

/** Ce qui s'est passé chaque jour (calendrier) : commissions, vidéos postées, échantillons. */
export interface DayInfo {
  commissionsCents: number;
  videos: ManagerVideo[];
  requested: ManagerSample[];
  received: ManagerSample[];
  earnings: ManagerEarning[];
}

export function byDay(data: Pick<ManagerData, 'earnings' | 'videos' | 'samples'>, productId: string | null): Record<string, DayInfo> {
  const days: Record<string, DayInfo> = {};
  const day = (d: string) => (days[d] ??= { commissionsCents: 0, videos: [], requested: [], received: [], earnings: [] });
  const keep = (id: string | null) => !productId || id === productId;
  for (const e of data.earnings) {
    if (!keep(e.productId)) continue;
    day(e.date).commissionsCents += e.amountCents;
    day(e.date).earnings.push(e);
  }
  for (const v of data.videos) if (keep(v.productId) && v.postedAt) day(v.postedAt).videos.push(v);
  for (const s of data.samples) {
    if (!keep(s.product_id)) continue;
    day(s.requested_at).requested.push(s);
    if (s.received_at) day(s.received_at).received.push(s);
  }
  return days;
}
