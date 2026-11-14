'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getLiveCatalog } from '@/lib/catalog';
import { ensureSearchProduct } from '@/lib/radar/search-products';
import { regionFor } from '@/lib/regions';
import { listBoards } from '@/lib/v2/board';
import { completeStep, isLaunchStep, launchHref } from '@/lib/v2/launch';
import { closeLaunch, ensureFollowed, getLaunch, reopenLaunch, saveLaunch, startLaunch, syncLaunchStage } from '@/lib/v2/launch-store';
import { parisDate } from '@/lib/utils';
import { isScriptFormat } from '@/lib/ai/formats';
import { getPlan } from '@/lib/plans';
import { displayName } from '@/lib/product-name';
import { getUsageToday, latestSettings } from '@/lib/studio';
import { allowedFormats } from '@/lib/studio/limits';
import { getDoc } from '@/lib/studio/store';
import { startTask } from '@/lib/tasks/start';
import { SAMPLE_KIND, type SampleData } from '@/lib/v2/manager';
import type { Repo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { rhythmFor } from '@/lib/profile-rules';
import { addDays } from '@/lib/utils';
import { ensureBoard, saveBoard } from '@/lib/v2/board';
import { isRhythm, moveItem, moveItemDate, schedulePlan, setPostedDetails } from '@/lib/v2/planning';
import { isLocalMode } from '@/lib/env';
import { EARNINGS_KIND, type EarningData } from '@/lib/v2/earnings';
import { checkPublishedLink } from '@/lib/v2/launch-publish';

function refresh(id?: string) {
  revalidatePath('/app');
  revalidatePath('/app/lancer');
  revalidatePath('/app/mes-produits');
  if (id) revalidatePath(`/app/lancer/${id}`);
}

/** Retour sûr vers une page de l'appli (jamais une autre adresse). */
function safeBack(raw: FormDataEntryValue | null, fallback: string): string {
  const value = String(raw ?? '');
  return value.startsWith('/app') && !value.startsWith('//') ? value : fallback;
}

/**
 * « Lancer ce produit », « Écrire mes scripts », étoile de suivi : ouvre ou reprend le lancement du produit (le produit
 * est suivi au passage). Un produit trouvé par une recherche reçoit d'abord sa fiche. `etape` : où ouvrir (par défaut,
 * là où le lancement en est).
 */
export async function startLaunchAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const productId = String(formData.get('produit') ?? '');
  const back = safeBack(formData.get('retour'), '/app/lancer/nouveau');
  const wanted = String(formData.get('etape') ?? '');
  if (!(await repo.getProduct(productId))) {
    const catalog = (await getLiveCatalog(repo, new Date(), regionFor(profile))).products;
    await ensureSearchProduct(repo, profile, productId, catalog);
  }
  const result = await startLaunch(repo, profile, productId, parisDate());
  const sep = back.includes('?') ? '&' : '?';
  if (!result.ok) redirect(`${back}${sep}lancement=${result.reason}`);
  refresh(result.launch.id);
  redirect(launchHref(result.launch.id, isLaunchStep(wanted) ? wanted : result.launch.data.step, result.created ? { bravo: 'produit' } : {}));
}

/** « Étape suivante » : l'étape est validée, le statut du dashboard suit, et on passe à la suivante. */
export async function nextStepAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const launch = await getLaunch(repo, profile.id, String(formData.get('id') ?? ''));
  const step = String(formData.get('etape') ?? '');
  if (!launch || !isLaunchStep(step)) redirect('/app/lancer');
  const data = completeStep(launch.data, step);
  await saveLaunch(repo, profile.id, launch, data);
  const board = (await listBoards(repo, profile.id)).get(data.product_id)?.data ?? null;
  await syncLaunchStage(repo, profile.id, data, board, parisDate());
  refresh(launch.id);
  redirect(launchHref(launch.id, data.step, { bravo: step }));
}

/** Terminé ou abandonné : le lancement quitte les produits en cours et reste dans l'historique. */
export async function closeLaunchAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const launch = await getLaunch(repo, profile.id, String(formData.get('id') ?? ''));
  const state = String(formData.get('etat') ?? '');
  if (!launch || (state !== 'termine' && state !== 'abandonne')) redirect('/app/lancer');
  await closeLaunch(repo, profile.id, launch, state, parisDate());
  refresh(launch.id);
  redirect(`/app/lancer?ferme=${state}#historique`);
}

/** Rouvre un lancement de l'historique (le produit revient dans les produits en cours). */
export async function reopenLaunchAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const launch = await getLaunch(repo, profile.id, String(formData.get('id') ?? ''));
  if (!launch) redirect('/app/lancer');
  if (!(await reopenLaunch(repo, profile, launch, parisDate()))) redirect('/app/lancer?lancement=limite#historique');
  refresh(launch.id);
  redirect(launchHref(launch.id, launch.data.step));
}

// ---------------------------------------------------------------------------------------------------------------------
// Étape « Échantillon »
// ---------------------------------------------------------------------------------------------------------------------

async function ownLaunch(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const launch = await getLaunch(repo, profile.id, String(formData.get('id') ?? ''));
  if (!launch) redirect('/app/lancer');
  return { profile, repo, launch };
}

/** Date AAAA-MM-JJ du formulaire, jamais dans le futur (aujourd'hui par défaut). */
function pastDate(raw: FormDataEntryValue | null, today: string): string {
  const value = String(raw ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= today ? value : today;
}

/**
 * Cases « Échantillon demandé » et « Échantillon reçu » (avec leur date) : la fiche échantillon du gestionnaire est
 * créée ou mise à jour, le statut du dashboard suit. Reçu : l'étape est validée, on passe aux scripts.
 */
export async function sampleAction(formData: FormData) {
  const { profile, repo, launch } = await ownLaunch(formData);
  const today = parisDate();
  const requested = formData.get('demande') === '1';
  const received = formData.get('recu') === '1';
  const requestedAt = pastDate(formData.get('date_demande'), today);
  const receivedAt = pastDate(formData.get('date_recu'), today);
  const product = await repo.getProduct(launch.data.product_id);
  const existing = launch.data.sample_id ? await repo.getRecord<SampleData>(profile.id, launch.data.sample_id) : null;
  const sample = existing?.kind === SAMPLE_KIND ? existing : null;

  let data = launch.data;
  if (requested || received) {
    const record = await repo.saveRecord<SampleData>(
      profile.id,
      SAMPLE_KIND,
      {
        product_id: data.product_id,
        product_name: product ? displayName(product) : data.product_name,
        requested_at: received && !requested ? (sample?.data.requested_at ?? receivedAt) : requestedAt,
        received_at: received ? receivedAt : null,
        follow_ups: sample?.data.follow_ups ?? [],
        note: sample?.data.note ?? null,
      },
      sample?.id,
    );
    data = { ...data, sample: received ? 'recu' : 'demande', sample_id: record.id };
  } else {
    if (sample) await repo.deleteRecord(profile.id, sample.id);
    data = { ...data, sample: 'a_faire', sample_id: null };
  }
  if (received) data = completeStep(data, 'echantillon');
  await saveLaunch(repo, profile.id, launch, data);
  await syncLaunchStage(repo, profile.id, data, (await listBoards(repo, profile.id)).get(data.product_id)?.data ?? null, today);
  refresh(launch.id);
  redirect(received ? launchHref(launch.id, 'scripts', { bravo: 'echantillon' }) : launchHref(launch.id, 'echantillon', { ok: requested ? 'demande' : 'efface' }));
}

/** « Pas d'échantillon, je passe » : l'étape est validée sans échantillon. */
export async function skipSampleAction(formData: FormData) {
  const { profile, repo, launch } = await ownLaunch(formData);
  const data = completeStep({ ...launch.data, sample: launch.data.sample === 'a_faire' ? 'passe' : launch.data.sample }, 'echantillon');
  await saveLaunch(repo, profile.id, launch, data);
  refresh(launch.id);
  redirect(launchHref(launch.id, 'scripts'));
}

// ---------------------------------------------------------------------------------------------------------------------
// Étape « Scripts » : le studio dans l'étape (les tâches reviennent au lancement)
// ---------------------------------------------------------------------------------------------------------------------

/** Ouvre la tâche : sur Netlify, l'étape attend sur place (`tache`), en local le résultat arrive directement. */
function afterTask(launchId: string, path: string): never {
  const waiting = path.match(/^\/app\/attente\/([\w-]+)$/);
  redirect(waiting ? launchHref(launchId, 'scripts', { tache: waiting[1] }) : path);
}

export async function launchGenerateAction(formData: FormData) {
  const { profile, launch } = await ownLaunch(formData);
  const format = formData.get('format');
  if (!isScriptFormat(format) || !allowedFormats(profile.plan).includes(format)) {
    redirect(launchHref(launch.id, 'scripts', { erreur: 'Choisis un format de vidéo de ton plan.' }));
  }
  if ((await getUsageToday(profile)).remaining <= 0) {
    const plan = getPlan(profile.plan);
    redirect(
      launchHref(launch.id, 'scripts', { erreur: `Tu as écrit tes ${plan.scriptsPerDay} scripts du jour (plan ${plan.name}). Ton compteur repart à zéro demain matin.` }),
    );
  }
  const settings = await latestSettings(profile);
  const path = await startTask(
    profile,
    'studio',
    { produit: launch.data.product_id, format, reglages: settings, brouillon: null, lancement: launch.id },
    launchHref(launch.id, 'scripts'),
  );
  refresh(launch.id);
  afterTask(launch.id, path);
}

export async function launchSeriesAction(formData: FormData) {
  const { profile, launch } = await ownLaunch(formData);
  const path = await startTask(profile, 'serie', { produit: launch.data.product_id, lancement: launch.id }, launchHref(launch.id, 'scripts'));
  refresh(launch.id);
  afterTask(launch.id, path);
}

export async function launchAngleAction(formData: FormData) {
  const { profile, launch } = await ownLaunch(formData);
  const path = await startTask(
    profile,
    'angle',
    { serie: String(formData.get('serie') ?? ''), angle: Number(formData.get('angle')), lancement: launch.id },
    launchHref(launch.id, 'scripts'),
  );
  refresh(launch.id);
  afterTask(launch.id, path);
}

/** Garde (ou ne garde plus) un script pour une vidéo : le n-ième script gardé va à la vidéo n. */
export async function keepScriptAction(formData: FormData) {
  const { profile, repo, launch } = await ownLaunch(formData);
  const docId = String(formData.get('doc') ?? '');
  const index = Number(formData.get('script'));
  const doc = await getDoc(profile.id, docId, repo);
  if (!doc || doc.product_id !== launch.data.product_id || !doc.scripts[index]) redirect(launchHref(launch.id, 'scripts'));
  const kept = launch.data.kept.some((k) => k.doc_id === docId && k.script === index)
    ? launch.data.kept.filter((k) => !(k.doc_id === docId && k.script === index))
    : [...launch.data.kept, { doc_id: docId, script: index, title: doc.scripts[index].title }].slice(0, 200);
  await saveLaunch(repo, profile.id, launch, { ...launch.data, kept });
  refresh(launch.id);
  redirect(launchHref(launch.id, 'scripts', { garde: String(kept.length) }) + `#script-${docId}-${index}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Étapes « Planifier » et « Tourner » : le tableau des vidéos du produit (fiche `publication`)
// ---------------------------------------------------------------------------------------------------------------------

/** Tableau des vidéos du produit du lancement (créé au besoin ; le produit est suivi). */
async function launchBoard(profile: Profile, repo: Repo, productId: string) {
  if (!(await ensureFollowed(repo, profile, productId))) return null;
  const saved = await repo.getSavedProduct(profile.id, productId);
  const product = await repo.getProduct(productId);
  if (!saved || !product) return null;
  return ensureBoard(repo, profile.id, saved, product);
}

/**
 * « Planifier mes vidéos » : les vidéos pas encore postées sont réparties au rythme choisi (celui de l'onboarding par
 * défaut), à partir de la date donnée. Les rappels du jour J partent tout seuls pour les vidéos datées.
 */
export async function planLaunchAction(formData: FormData) {
  const { profile, repo, launch } = await ownLaunch(formData);
  if (!getPlan(profile.plan).planning) redirect(launchHref(launch.id, 'planifier'));
  const today = parisDate();
  const rhythm = Number(formData.get('rythme'));
  const start = String(formData.get('debut') ?? '');
  const record = await launchBoard(profile, repo, launch.data.product_id);
  if (!record) redirect(launchHref(launch.id, 'planifier', { erreur: 'limite' }));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(start) && start >= today ? start : addDays(today, 1);
  await saveBoard(repo, profile.id, record, schedulePlan(record.data, isRhythm(rhythm) ? rhythm : rhythmFor(profile.videos_per_week), from));
  refresh(launch.id);
  revalidatePath('/app/plan');
  redirect(launchHref(launch.id, 'planifier', { ok: 'planifie' }));
}

/** Glisser-déposer : une vidéo change de jour. Appelée depuis le calendrier (sans rechargement de page). */
export async function moveVideoDateAction(launchId: string, n: number, date: string): Promise<{ ok: boolean }> {
  const { profile } = await requireOnboardedViewer('/app/lancer');
  const repo = getRepo();
  const launch = await getLaunch(repo, profile.id, launchId);
  if (!launch) return { ok: false };
  const record = (await listBoards(repo, profile.id)).get(launch.data.product_id);
  if (!record) return { ok: false };
  const next = moveItemDate(record.data, Number(n), String(date), parisDate());
  if (next === record.data) return { ok: false };
  await saveBoard(repo, profile.id, record, next);
  refresh(launch.id);
  revalidatePath('/app/plan');
  return { ok: true };
}

/** Case « Tournée » d'une vidéo : le statut passe à « En tournage » à la première. */
export async function filmedAction(formData: FormData) {
  const { profile, repo, launch } = await ownLaunch(formData);
  const today = parisDate();
  const n = Number(formData.get('n'));
  const record = await launchBoard(profile, repo, launch.data.product_id);
  if (!record) redirect(launchHref(launch.id, 'tourner'));
  const item = record.data.items.find((i) => i.n === n);
  if (!item || item.status === 'poste') redirect(launchHref(launch.id, 'tourner'));
  const filmed = item.status !== 'tourne';
  const plan = moveItem(record.data, n, filmed ? 'tourne' : 'a_tourner', today);
  await saveBoard(repo, profile.id, record, plan);
  await syncLaunchStage(repo, profile.id, launch.data, plan, today);
  refresh(launch.id);
  redirect(launchHref(launch.id, 'tourner') + `#video-${n}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Étapes « Publier » et « Résultats »
// ---------------------------------------------------------------------------------------------------------------------


/**
 * La vidéo est en ligne : son lien la passe en « posté » (date du jour), avec ses chiffres publics quand la source les
 * donne. Le compteur « Vidéos postées », l'objectif de la semaine et le statut (« En ligne ») suivent. Avec une vidéo
 * déjà postée, change seulement son lien.
 */
export async function publishVideoAction(formData: FormData) {
  const { profile, repo, launch } = await ownLaunch(formData);
  const today = parisDate();
  const n = Number(formData.get('n'));
  const check = await checkPublishedLink(String(formData.get('lien') ?? ''), { repo, userId: profile.id, offline: isLocalMode() });
  if (!check.ok) redirect(launchHref(launch.id, 'publier', { erreur: check.reason, video: String(n) }) + `#video-${n}`);
  const record = await launchBoard(profile, repo, launch.data.product_id);
  if (!record) redirect(launchHref(launch.id, 'publier'));
  const item = record.data.items.find((i) => i.n === n);
  if (!item) redirect(launchHref(launch.id, 'publier'));
  const first = !record.data.items.some((i) => i.status === 'poste');
  let plan = item.status === 'poste' ? record.data : moveItem(record.data, n, 'poste', today);
  plan = setPostedDetails(plan, n, {
    url: check.link.url,
    posted_at: item.posted_at ?? today,
    views: check.views ?? item.views ?? null,
    sales: check.sales ?? item.sales ?? null,
  });
  await saveBoard(repo, profile.id, record, plan);
  await syncLaunchStage(repo, profile.id, launch.data, plan, today);
  refresh(launch.id);
  revalidatePath('/app/plan');
  redirect(launchHref(launch.id, 'publier', first ? { bravo: 'premiere' } : { ok: 'publie' }) + `#video-${n}`);
}

/** Vues et ventes d'une vidéo, saisies (ou corrigées) à la main. */
export async function saveResultsAction(formData: FormData) {
  const { profile, repo, launch } = await ownLaunch(formData);
  const n = Number(formData.get('n'));
  const record = (await listBoards(repo, profile.id)).get(launch.data.product_id);
  const item = record?.data.items.find((i) => i.n === n && i.status === 'poste');
  if (!record || !item) redirect(launchHref(launch.id, 'resultats'));
  const count = (value: FormDataEntryValue | null) => {
    const raw = String(value ?? '').replace(/\s/g, '');
    if (!raw) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 1_000_000_000) : null;
  };
  const plan = setPostedDetails(record.data, n, { url: item.url, posted_at: item.posted_at ?? null, views: count(formData.get('vues')), sales: count(formData.get('ventes')) });
  await saveBoard(repo, profile.id, record, plan);
  refresh(launch.id);
  redirect(launchHref(launch.id, 'resultats', { ok: 'chiffres' }) + `#resultat-${n}`);
}

/** Commission reçue pour ce produit (suivi des gains : Pro et Elite), saisie à la main. */
export async function addCommissionAction(formData: FormData) {
  const { profile, repo, launch } = await ownLaunch(formData);
  if (!getPlan(profile.plan).earnings) redirect(launchHref(launch.id, 'resultats'));
  const today = parisDate();
  const euros = Number(String(formData.get('montant') ?? '').replace(',', '.').replace(/\s/g, ''));
  if (!Number.isFinite(euros) || euros <= 0 || euros > 100_000) redirect(launchHref(launch.id, 'resultats', { erreur: 'montant' }));
  const product = await repo.getProduct(launch.data.product_id);
  await repo.saveRecord<EarningData>(profile.id, EARNINGS_KIND, {
    date: pastDate(formData.get('date'), today),
    product_name: product ? displayName(product) : launch.data.product_name,
    product_id: launch.data.product_id,
    video: null,
    amount_cents: Math.round(euros * 100),
    sales: null,
    source: 'saisie',
    niche: product?.niche ?? null,
  });
  refresh(launch.id);
  redirect(launchHref(launch.id, 'resultats', { ok: 'commission' }));
}
