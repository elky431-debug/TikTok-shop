'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { startTask } from '@/lib/tasks/start';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { isNicheId, type NicheId } from '@/lib/niches';
import { parisDate } from '@/lib/utils';
import { parseDate } from '@/lib/v2/earnings';
import {
  CHECKLIST,
  CONTENT_PLAN_KIND,
  contentPlansPerDay,
  declareThresholdReached,
  getPreparation,
  recordFollowers,
  savePreparation,
} from '@/lib/v2/preparation';
import { remainingToday } from '@/lib/v2/quota';

const PATH = '/app/preparation';

async function viewer() {
  const { profile } = await requireOnboardedViewer(PATH);
  return profile;
}

const back = (query: string): never => {
  revalidatePath(PATH);
  revalidatePath('/app');
  redirect(`${PATH}?${query}`);
};

/** Abonnés du jour (saisis à la main). Au seuil, passage automatique au mode affilié. */
export async function logFollowersAction(formData: FormData) {
  const profile = await viewer();
  const today = parisDate();
  const count = Math.round(Number(String(formData.get('abonnes') ?? '').replace(/\s/g, '')));
  const date = parseDate(String(formData.get('date') ?? '')) ?? today;
  if (!Number.isFinite(count) || count < 0 || count > 100_000_000 || date > today) back('erreur=abonnes#progression');
  const result = await recordFollowers(getRepo(), profile, { date, count }, today);
  back(result.switched ? 'ok=affilie' : 'ok=abonnes#progression');
}

export async function declareThresholdAction() {
  const profile = await viewer();
  const result = await declareThresholdReached(getRepo(), profile, parisDate());
  back(result.switched ? 'ok=affilie' : 'ok=deja');
}

/** Goûts : niches aimées et ce que l'utilisateur aime filmer. */
export async function saveTastesAction(formData: FormData) {
  const profile = await viewer();
  const niches = formData.getAll('niches').map(String).filter(isNicheId) as NicheId[];
  const about = String(formData.get('envies') ?? '').trim().slice(0, 400) || null;
  await savePreparation(getRepo(), profile.id, { tastes: { niches: [...new Set(niches)], about } });
  back('ok=gouts#niche');
}

export async function chooseNicheAction(formData: FormData) {
  const profile = await viewer();
  const niche = String(formData.get('niche') ?? '');
  if (!isNicheId(niche)) back('erreur=niche#niche');
  await savePreparation(getRepo(), profile.id, { niche: niche as NicheId });
  back('ok=niche#plan');
}

/** Plan de 30 jours (IA, simulée sans clé), quota quotidien côté serveur. */
export async function generatePlanAction() {
  const profile = await viewer();
  const repo = getRepo();
  const prep = await getPreparation(repo, profile.id);
  if (!prep.data.niche) back('erreur=niche#niche');
  if ((await remainingToday(profile.id, CONTENT_PLAN_KIND, contentPlansPerDay(profile))) <= 0) back('erreur=quota#plan');
  const path = await startTask(profile, 'preparation', {}, `${PATH}#plan`);
  revalidatePath(PATH);
  redirect(path);
}

export async function saveChecklistAction(formData: FormData) {
  const profile = await viewer();
  const checked = new Set(formData.getAll('fait').map(String));
  await savePreparation(getRepo(), profile.id, { checklist: Object.fromEntries(CHECKLIST.map((i) => [i.id, checked.has(i.id)])) });
  back('ok=liste#verification');
}
