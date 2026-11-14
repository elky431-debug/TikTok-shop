import type { Repo } from '@/lib/db';
import type { Product, Profile, UserRecord } from '@/lib/db/types';
import { getPlan } from '@/lib/plans';
import { fallbackImageUrl } from '@/lib/product-image';
import { displayName } from '@/lib/product-name';
import { commissionPerSale } from '@/lib/score';
import { listDocs } from '@/lib/studio/store';
import { KIND_SERIES, type SeriesData, type StudioDocView } from '@/lib/studio/types';
import { listBoards, type BoardRecord } from './board';
import { EARNINGS_KIND, type EarningData } from './earnings';
import { effectiveDone, launchProgress, type LaunchStep } from './launch';
import { listLaunches, type LaunchRecord } from './launch-store';
import { SAMPLE_KIND, stageOf, TRACK_KIND, type ProductStage, type ProductTrack, type SampleData } from './manager';
import { planProgress } from './planning';

/** Ce qu'une carte de lancement affiche (accueil de l'onglet). */
export interface LaunchCard {
  id: string;
  productId: string;
  name: string;
  image: string;
  fallback: string;
  step: LaunchStep;
  progress: number;
  stage: ProductStage;
  state: LaunchRecord['data']['state'];
  posted: number;
  goal: number;
  startedAt: string;
  endedAt: string | null;
}

/** Lancements en cours et historique, avec leur avancement et le statut du dashboard. */
export async function loadLaunchCards(repo: Repo, userId: string): Promise<{ open: LaunchCard[]; history: LaunchCard[] }> {
  const [launches, boards, tracks] = await Promise.all([listLaunches(repo, userId), listBoards(repo, userId), repo.listRecords<ProductTrack>(userId, TRACK_KIND)]);
  const products = new Map((await repo.getProducts([...new Set(launches.map((l) => l.data.product_id))])).map((p) => [p.id, p]));
  const trackBy = new Map(tracks.map((t) => [t.data.product_id, t.data]));
  const cards = launches.map((l): LaunchCard => {
    const product = products.get(l.data.product_id);
    const board = boards.get(l.data.product_id)?.data ?? null;
    const progress = board ? planProgress(board) : { posted: 0, total: 20 };
    return {
      id: l.id,
      productId: l.data.product_id,
      name: product ? displayName(product) : l.data.product_name,
      image: product?.image_url ?? '',
      fallback: fallbackImageUrl(l.data.product_id, product?.niche ?? 'maison'),
      step: l.data.step,
      progress: launchProgress(l.data, board),
      stage: stageOf(trackBy.get(l.data.product_id) ?? null, board),
      state: l.data.state,
      posted: progress.posted,
      goal: progress.total,
      startedAt: l.data.started_at,
      endedAt: l.data.ended_at,
    };
  });
  return { open: cards.filter((c) => c.state === 'en_cours'), history: cards.filter((c) => c.state !== 'en_cours') };
}

/** Tout ce qu'une page de lancement peut montrer, chargé en une fois. */
export interface LaunchPageData {
  launch: LaunchRecord;
  product: Product | null;
  board: BoardRecord | null;
  done: LaunchStep[];
  progress: number;
  stage: ProductStage;
  sample: UserRecord<SampleData> | null;
  /** Générations du studio pour ce produit, de la plus récente à la plus ancienne. */
  docs: StudioDocView[];
  series: UserRecord<SeriesData> | null;
  earningsCents: number;
  commissionPerSaleCents: number;
}

export async function loadLaunchPage(repo: Repo, profile: Pick<Profile, 'id' | 'plan'>, launch: LaunchRecord): Promise<LaunchPageData> {
  const productId = launch.data.product_id;
  const canEarnings = getPlan(profile.plan).earnings;
  const [product, boards, tracks, samples, docs, series, earnings] = await Promise.all([
    repo.getProduct(productId),
    listBoards(repo, profile.id),
    repo.listRecords<ProductTrack>(profile.id, TRACK_KIND),
    repo.listRecords<SampleData>(profile.id, SAMPLE_KIND),
    listDocs(profile.id, repo),
    repo.listRecords<SeriesData>(profile.id, KIND_SERIES),
    canEarnings ? repo.listRecords<EarningData>(profile.id, EARNINGS_KIND) : Promise.resolve([] as Array<UserRecord<EarningData>>),
  ]);
  const board = boards.get(productId) ?? null;
  const sample =
    (launch.data.sample_id ? samples.find((s) => s.id === launch.data.sample_id) : null) ??
    samples.filter((s) => s.data.product_id === productId).sort((a, b) => b.data.requested_at.localeCompare(a.data.requested_at))[0] ??
    null;
  return {
    launch,
    product,
    board,
    done: effectiveDone(launch.data, board?.data ?? null),
    progress: launchProgress(launch.data, board?.data ?? null),
    stage: stageOf(tracks.find((t) => t.data.product_id === productId)?.data ?? null, board?.data ?? null),
    sample,
    docs: docs.filter((d) => d.product_id === productId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    series: series.filter((s) => s.data.product_id === productId && s.data.angles.length).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    earningsCents: earnings.filter((e) => e.data.product_id === productId).reduce((s, e) => s + e.data.amount_cents, 0),
    commissionPerSaleCents: product ? commissionPerSale(product.price_cents, product.commission_rate) : 0,
  };
}
