'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { parseDate } from '@/lib/v2/earnings';
import { ensureBoard, saveBoard, setBoardGoal, setWeeklyGoal } from '@/lib/v2/board';
import { isPlanStatus, moveItem, safeUrl, setPostedDetails, type PlanItem, type PlanItemStatus } from '@/lib/v2/planning';
import { parisDate } from '@/lib/utils';

async function current(productId: string) {
  const { profile } = await requireOnboardedViewer('/app/mes-produits');
  const repo = getRepo();
  const row = productId ? await repo.getSavedProduct(profile.id, productId) : null;
  const product = row ? await repo.getProduct(productId) : null;
  return { profile, repo, row, product };
}

function refresh(productId: string) {
  revalidatePath('/app/mes-produits');
  revalidatePath(`/app/mes-produits/${encodeURIComponent(productId)}`);
  revalidatePath('/app/plan');
}

export type MoveResult = { ok: true; items: PlanItem[] } | { ok: false; message: string };

/** Déplace une vidéo du tableau (glisser-déposer, clavier ou boutons). Appelée depuis le tableau, côté client. */
export async function moveVideoAction(productId: string, n: number, status: PlanItemStatus): Promise<MoveResult> {
  const { profile, repo, row, product } = await current(String(productId));
  if (!row || !product) return { ok: false, message: 'Ce produit n’est plus dans tes produits suivis.' };
  if (!isPlanStatus(status) || !Number.isInteger(n)) return { ok: false, message: 'Déplacement impossible.' };
  const record = await ensureBoard(repo, profile.id, row, product);
  if (!record.data.items.some((i) => i.n === n)) return { ok: false, message: 'Cette vidéo n’existe plus. Recharge la page.' };
  const saved = await saveBoard(repo, profile.id, record, moveItem(record.data, n, status, parisDate()));
  refresh(product.id);
  return { ok: true, items: saved.data.items };
}

const optionalInt = (value: FormDataEntryValue | null) => {
  const raw = String(value ?? '').replace(/\s/g, '');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 1_000_000_000) : null;
};

/** Lien, date, vues et ventes d'une vidéo postée, saisis à la main. */
export async function savePostedDetailsAction(formData: FormData) {
  const productId = String(formData.get('produit') ?? '');
  const n = Number(formData.get('n'));
  const { profile, repo, row, product } = await current(productId);
  if (!row || !product) redirect('/app/mes-produits');
  const rawUrl = String(formData.get('lien') ?? '');
  const url = safeUrl(rawUrl);
  const back = `/app/mes-produits/${encodeURIComponent(product.id)}`;
  if (rawUrl.trim() && !url) redirect(`${back}?erreur=lien&video=${n}`);
  const postedAt = parseDate(String(formData.get('date') ?? ''));
  const record = await ensureBoard(repo, profile.id, row, product);
  if (!record.data.items.some((i) => i.n === n)) redirect(back);
  await saveBoard(
    repo,
    profile.id,
    record,
    setPostedDetails(record.data, n, {
      url,
      posted_at: postedAt && postedAt <= parisDate() ? postedAt : (record.data.items.find((i) => i.n === n)?.posted_at ?? parisDate()),
      views: optionalInt(formData.get('vues')),
      sales: optionalInt(formData.get('ventes')),
    }),
  );
  refresh(product.id);
  redirect(`${back}?ok=details&video=${n}#video-${n}`);
}

export async function setVideoGoalAction(formData: FormData) {
  const productId = String(formData.get('produit') ?? '');
  const goal = Math.round(Number(formData.get('objectif')));
  const { profile, repo, row, product } = await current(productId);
  if (!row || !product || !Number.isFinite(goal)) return;
  await setBoardGoal(repo, profile.id, row, product, goal, parisDate());
  refresh(product.id);
}

export async function setWeeklyGoalAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/mes-produits');
  await setWeeklyGoal(getRepo(), profile.id, Number(formData.get('objectif_semaine')));
  revalidatePath('/app/mes-produits');
  redirect('/app/mes-produits?ok=objectif');
}

/** Retire le produit suivi. Son tableau est gardé (historique des vidéos postées) et revient s'il est suivi à nouveau. */
export async function removeSavedProductAction(formData: FormData) {
  const productId = String(formData.get('produit') ?? '');
  const { profile, repo } = await current(productId);
  await repo.removeSavedProduct(profile.id, productId);
  revalidatePath('/app/mes-produits');
  revalidatePath('/app');
  redirect('/app/mes-produits');
}
