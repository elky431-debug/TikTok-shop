import type { Repo } from '@/lib/db';
import type { Profile, UserRecord } from '@/lib/db/types';
import { DEFAULT_VIDEO_GOAL, getPlan } from '@/lib/plans';
import { listBoards } from './board';
import { LAUNCH_KIND, newLaunch, statusFromLaunch, type LaunchData } from './launch';
import { isClosedStage, shouldAdvance, stageOf, TRACK_KIND, withStatus, type PipelineStatus, type ProductStage, type ProductTrack } from './manager';
import type { PublicationPlan } from './planning';

/** Accès serveur aux lancements (fiches `lancement`) et au statut du dashboard qui les suit. */
export type LaunchRecord = UserRecord<LaunchData>;

/** Lancements de la personne, du plus récent au plus ancien. */
export async function listLaunches(repo: Repo, userId: string): Promise<LaunchRecord[]> {
  const records = await repo.listRecords<LaunchData>(userId, LAUNCH_KIND);
  return [...records].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getLaunch(repo: Repo, userId: string, id: string): Promise<LaunchRecord | null> {
  const record = await repo.getRecord<LaunchData>(userId, id);
  return record && record.kind === LAUNCH_KIND ? record : null;
}

/** Lancement d'un produit : celui en cours, sinon le plus récent (terminé ou abandonné). */
export async function launchForProduct(repo: Repo, userId: string, productId: string): Promise<LaunchRecord | null> {
  const mine = (await listLaunches(repo, userId)).filter((l) => l.data.product_id === productId);
  return mine.find((l) => l.data.state === 'en_cours') ?? mine[0] ?? null;
}

export function saveLaunch(repo: Repo, userId: string, record: Pick<LaunchRecord, 'id'>, data: LaunchData): Promise<LaunchRecord> {
  return repo.saveRecord<LaunchData>(userId, LAUNCH_KIND, data, record.id);
}

export type StartLaunchResult = { ok: true; launch: LaunchRecord; created: boolean } | { ok: false; reason: 'introuvable' | 'limite' };

/** Suit le produit s'il ne l'est pas encore (limite de produits suivis du plan vérifiée ici, côté serveur). */
export async function ensureFollowed(repo: Repo, profile: Pick<Profile, 'id' | 'plan'>, productId: string): Promise<boolean> {
  if (await repo.getSavedProduct(profile.id, productId)) return true;
  const saved = await repo.listSavedProducts(profile.id);
  if (saved.length >= getPlan(profile.plan).savedProducts) return false;
  await repo.saveProduct(profile.id, productId, DEFAULT_VIDEO_GOAL);
  return true;
}

/**
 * Ouvre ou reprend le lancement d'un produit. Le produit est suivi au passage ; un lancement terminé ou abandonné n'est
 * pas rouvert ici : un nouveau commence (« Reprendre » dans l'historique rouvre l'ancien).
 */
export async function startLaunch(repo: Repo, profile: Pick<Profile, 'id' | 'plan'>, productId: string, today: string): Promise<StartLaunchResult> {
  const product = await repo.getProduct(productId);
  if (!product) return { ok: false, reason: 'introuvable' };
  if (!(await ensureFollowed(repo, profile, productId))) return { ok: false, reason: 'limite' };
  const current = await launchForProduct(repo, profile.id, productId);
  if (current?.data.state === 'en_cours') return { ok: true, launch: current, created: false };
  const launch = await repo.saveRecord<LaunchData>(profile.id, LAUNCH_KIND, newLaunch(product, today));
  // Un nouveau lancement repart de « À lancer » si le produit avait été terminé ou abandonné.
  const track = await trackFor(repo, profile.id, productId);
  if (track && isClosedStage(track.data.status)) await repo.deleteRecord(profile.id, track.id);
  return { ok: true, launch, created: true };
}

/** Rouvre un lancement de l'historique : le produit revient dans les produits en cours, au statut que son parcours justifie. */
export async function reopenLaunch(repo: Repo, profile: Pick<Profile, 'id' | 'plan'>, record: LaunchRecord, today: string): Promise<boolean> {
  if (!(await ensureFollowed(repo, profile, record.data.product_id))) return false;
  const others = (await listLaunches(repo, profile.id)).filter((l) => l.id !== record.id && l.data.product_id === record.data.product_id && l.data.state === 'en_cours');
  for (const other of others) await saveLaunch(repo, profile.id, other, { ...other.data, state: 'abandonne', ended_at: today });
  const data: LaunchData = { ...record.data, state: 'en_cours', ended_at: null };
  await saveLaunch(repo, profile.id, record, data);
  const board = (await listBoards(repo, profile.id)).get(data.product_id)?.data ?? null;
  await setProductStage(repo, profile.id, data.product_id, statusFromLaunch(data, board) ?? 'a_lancer', 'manuel', today);
  return true;
}

async function trackFor(repo: Repo, userId: string, productId: string) {
  return (await repo.listRecords<ProductTrack>(userId, TRACK_KIND)).find((t) => t.data.product_id === productId) ?? null;
}

/** Statut affiché d'un produit (le même calcul que le dashboard). */
export async function currentStage(repo: Repo, userId: string, productId: string): Promise<ProductStage> {
  const [track, boards] = await Promise.all([trackFor(repo, userId, productId), listBoards(repo, userId)]);
  return stageOf(track?.data ?? null, boards.get(productId)?.data ?? null);
}

/**
 * Change le statut d'un produit.
 * - `auto` (une étape du parcours) : seulement vers l'avant, jamais sur un produit terminé ou abandonné.
 * - `manuel` (menu du dashboard) : n'importe quel statut ; « Terminé » et « Abandonné » ferment aussi le lancement en
 *   cours, un autre statut rouvre le dernier lancement fermé (correction d'une erreur).
 */
export async function setProductStage(
  repo: Repo,
  userId: string,
  productId: string,
  status: ProductStage,
  mode: 'auto' | 'manuel',
  today: string,
): Promise<ProductStage> {
  const track = await trackFor(repo, userId, productId);
  const board = (await listBoards(repo, userId)).get(productId)?.data ?? null;
  const current = stageOf(track?.data ?? null, board);
  if (mode === 'auto' && (status === 'a_lancer' || !shouldAdvance(current, status))) return current;

  if (status === 'a_lancer') {
    if (track) await repo.deleteRecord(userId, track.id);
  } else {
    const next = withStatus(track?.data ?? null, productId, status, today);
    if (next !== track?.data) await repo.saveRecord<ProductTrack>(userId, TRACK_KIND, next, track?.id);
  }

  if (mode === 'manuel') {
    const launch = await launchForProduct(repo, userId, productId);
    if (launch) {
      if (isClosedStage(status) && launch.data.state === 'en_cours') {
        await saveLaunch(repo, userId, launch, { ...launch.data, state: status === 'termine' ? 'termine' : 'abandonne', ended_at: today });
      } else if (!isClosedStage(status) && launch.data.state !== 'en_cours') {
        await saveLaunch(repo, userId, launch, { ...launch.data, state: 'en_cours', ended_at: null });
      }
    }
  }
  return status;
}

/** Après une étape : le statut du dashboard rattrape ce que le lancement justifie (vers l'avant seulement). */
export async function syncLaunchStage(repo: Repo, userId: string, launch: LaunchData, board: PublicationPlan | null, today: string) {
  const target = statusFromLaunch(launch, board);
  if (!target) return;
  if (isClosedStage(target)) {
    await setProductStage(repo, userId, launch.product_id, target, 'manuel', today);
    return;
  }
  await setProductStage(repo, userId, launch.product_id, target as PipelineStatus, 'auto', today);
}

/** Termine ou abandonne un lancement : il quitte les produits en cours et reste dans l'historique. */
export async function closeLaunch(repo: Repo, userId: string, record: LaunchRecord, state: 'termine' | 'abandonne', today: string) {
  const data: LaunchData = { ...record.data, state, ended_at: today };
  await saveLaunch(repo, userId, record, data);
  await setProductStage(repo, userId, record.data.product_id, state === 'termine' ? 'termine' : 'arrete', 'manuel', today);
  return data;
}

/** Échantillon noté depuis le dashboard : le lancement en cours du produit le sait aussi. */
export async function noteSampleOnLaunch(repo: Repo, userId: string, productId: string, sampleId: string, choice: 'demande' | 'recu') {
  const launch = await launchForProduct(repo, userId, productId);
  if (!launch || launch.data.state !== 'en_cours') return;
  if (choice === 'demande' && launch.data.sample === 'recu') return;
  await saveLaunch(repo, userId, launch, { ...launch.data, sample: choice, sample_id: sampleId });
}
