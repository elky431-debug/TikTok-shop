import type { Product } from '@/lib/db/types';
import { displayName } from '@/lib/product-name';
import type { PipelineStatus } from './manager';
import { planProgress, type PublicationPlan } from './planning';

/**
 * « Lancer un produit » : un produit suivi de bout en bout, de son choix jusqu'aux résultats de ses vidéos. Une fiche
 * `lancement` par produit et par lancement ; elle ne garde que le parcours (étape, étapes validées, échantillon, scripts
 * gardés). Le reste vit là où il vivait déjà : le produit suivi (`saved_products`), le tableau des vidéos et le
 * calendrier (fiche `publication`), l'échantillon (fiche `echantillon`), le statut du dashboard (fiche `suivi_produit`)
 * et les commissions (fiches `gain`). Chaque étape validée met donc à jour le dashboard sans rien recopier.
 *
 * TikTok n'ouvre pas son API aux affiliés en Europe : l'arrivée d'un échantillon ou la publication d'une vidéo passent
 * par une action de la personne (cocher une case, coller un lien), qui est une étape normale du parcours.
 */
export const LAUNCH_KIND = 'lancement';

export const LAUNCH_STEPS = ['produit', 'echantillon', 'scripts', 'planifier', 'tourner', 'publier', 'resultats'] as const;
export type LaunchStep = (typeof LAUNCH_STEPS)[number];

export const STEP_TITLES: Record<LaunchStep, string> = {
  produit: 'Choisis ton produit',
  echantillon: 'Demande ton échantillon',
  scripts: 'Écris tes scripts',
  planifier: 'Planifie tes vidéos',
  tourner: 'Tourne tes vidéos',
  publier: 'Publie tes vidéos',
  resultats: 'Suis tes résultats',
};

/** Nom court de chaque étape (frise). */
export const STEP_LABELS: Record<LaunchStep, string> = {
  produit: 'Produit',
  echantillon: 'Échantillon',
  scripts: 'Scripts',
  planifier: 'Planning',
  tourner: 'Tournage',
  publier: 'Publication',
  resultats: 'Résultats',
};

export type LaunchState = 'en_cours' | 'termine' | 'abandonne';
export type SampleChoice = 'a_faire' | 'demande' | 'recu' | 'passe';

/** Script gardé pour une vidéo : le n-ième script gardé va à la vidéo n. */
export interface KeptScript {
  doc_id: string;
  /** Index du script dans sa génération (0, 1 ou 2). */
  script: number;
  title: string;
}

export interface LaunchData {
  product_id: string;
  product_name: string;
  state: LaunchState;
  /** Étape où reprendre. */
  step: LaunchStep;
  /** Étapes validées. */
  done: LaunchStep[];
  sample: SampleChoice;
  /** Fiche `echantillon` liée (null tant qu'aucune demande n'est notée). */
  sample_id: string | null;
  kept: KeptScript[];
  /** AAAA-MM-JJ */
  started_at: string;
  ended_at: string | null;
}

export const isLaunchStep = (value: unknown): value is LaunchStep => LAUNCH_STEPS.includes(value as LaunchStep);

/** Adresse d'un lancement, à une étape, avec un message ou une célébration. */
export function launchHref(id: string, step?: LaunchStep | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ ...(step ? { etape: step } : {}), ...extra });
  return `/app/lancer/${id}${params.size ? `?${params}` : ''}`;
}

export const stepIndex = (step: LaunchStep) => LAUNCH_STEPS.indexOf(step);

/** Lancement neuf : le produit est choisi (étape 1 cochée), on reprend à l'échantillon. */
export function newLaunch(product: Pick<Product, 'id' | 'name'> & { short_name?: string | null }, today: string): LaunchData {
  return {
    product_id: product.id,
    product_name: displayName(product),
    state: 'en_cours',
    step: 'echantillon',
    done: ['produit'],
    sample: 'a_faire',
    sample_id: null,
    kept: [],
    started_at: today,
    ended_at: null,
  };
}

/** Étape suivante dans l'ordre (la dernière reste la dernière). */
export function nextStep(step: LaunchStep): LaunchStep {
  return LAUNCH_STEPS[Math.min(LAUNCH_STEPS.length - 1, stepIndex(step) + 1)];
}

export function previousStep(step: LaunchStep): LaunchStep {
  return LAUNCH_STEPS[Math.max(0, stepIndex(step) - 1)];
}

/** Valide une étape et passe à la suivante (on peut revalider une étape déjà faite : rien ne se perd). */
export function completeStep(launch: LaunchData, step: LaunchStep): LaunchData {
  const done = LAUNCH_STEPS.filter((s) => s === step || launch.done.includes(s));
  return { ...launch, done, step: nextStep(step) };
}

/** Revient sur une étape (les étapes déjà validées le restent). */
export function goToStep(launch: LaunchData, step: LaunchStep): LaunchData {
  return { ...launch, step };
}

export function isStepDone(launch: LaunchData, step: LaunchStep): boolean {
  return launch.done.includes(step);
}

/**
 * Étapes réellement faites, en tenant compte des vidéos : une vidéo tournée coche le tournage, une vidéo en ligne coche
 * la publication, même si la personne est passée par le dashboard plutôt que par le parcours.
 */
export function effectiveDone(launch: LaunchData, board: PublicationPlan | null): LaunchStep[] {
  const done = new Set(launch.done);
  if (board) {
    const p = planProgress(board);
    if (board.rhythm) done.add('planifier');
    if (p.filmed + p.posted > 0) done.add('tourner');
    if (p.posted > 0) done.add('publier');
  }
  return LAUNCH_STEPS.filter((s) => done.has(s));
}

/** Avancement en pourcentage (étapes faites sur 7). */
export function launchProgress(launch: LaunchData, board: PublicationPlan | null): number {
  return Math.round((effectiveDone(launch, board).length / LAUNCH_STEPS.length) * 100);
}

/** Statut du dashboard que l'état du lancement justifie (le plus avancé), ou null si rien n'est encore fait. */
export function statusFromLaunch(launch: LaunchData, board: PublicationPlan | null): PipelineStatus | null {
  if (launch.state === 'termine') return 'termine';
  if (launch.state === 'abandonne') return 'arrete';
  const p = board ? planProgress(board) : null;
  if (p && p.posted > 0) return 'en_ligne';
  if (p && p.filmed > 0) return 'en_tournage';
  if (launch.kept.length > 0 && launch.done.includes('scripts')) return 'scripts_prets';
  if (launch.sample === 'recu') return 'echantillon_recu';
  if (launch.sample === 'demande') return 'echantillon_demande';
  return null;
}

/**
 * Conseil après les premières vidéos, sans promesse : on continue tant que les ventes suivent ou qu'il y a trop peu de
 * vidéos pour juger ; après 6 vidéos en ligne sans aucune vente, on propose de passer à un autre produit.
 */
export function launchAdvice(input: { posted: number; goal: number; sales: number }): { tone: 'gain' | 'warn' | 'cyan'; title: string; text: string } {
  const left = Math.max(0, input.goal - input.posted);
  if (input.posted === 0) {
    return {
      tone: 'cyan',
      title: 'Publie ta première vidéo',
      text: 'Les résultats arrivent avec les vidéos : colle le lien de ta première vidéo à l’étape Publication.',
    };
  }
  if (input.sales > 0) {
    return {
      tone: 'gain',
      title: 'Continue à poster sur ce produit',
      text: left
        ? `Il se vend avec tes vidéos. Encore ${left} vidéo${left > 1 ? 's' : ''} pour atteindre ton objectif de ${input.goal}.`
        : `Objectif de ${input.goal} vidéos atteint : tu peux continuer, ou marquer ce lancement terminé.`,
    };
  }
  if (input.posted >= 6) {
    return {
      tone: 'warn',
      title: 'Pense à passer à un autre produit',
      text: `${input.posted} vidéos en ligne et pas encore de vente notée : essaie un autre produit du radar, ou un autre format de vidéo.`,
    };
  }
  return {
    tone: 'cyan',
    title: 'Continue à poster',
    text: `${input.posted} vidéo${input.posted > 1 ? 's' : ''} en ligne : c’est encore tôt pour juger. Les ventes viennent souvent avec le volume.`,
  };
}
