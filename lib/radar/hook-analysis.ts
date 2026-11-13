import { z } from 'zod';
import { findIssues } from '@/lib/ai/guard';
import { askStructured } from '@/lib/ai/structured';
import { getRepo, type Repo } from '@/lib/db';
import type { Product, Profile, TopVideo } from '@/lib/db/types';
import { getPlan } from '@/lib/plans';
import { remainingToday } from '@/lib/v2/quota';
import { formatCompact, formatInt } from '@/lib/utils';

/**
 * Analyse des accroches des vidéos qui vendent un produit (fiche produit, bloc 3) : type d'accroche, durée, structure,
 * à partir du texte de la vidéo (description de la source) et de ses chiffres. La vidéo elle-même n'est ni téléchargée
 * ni regardée. La durée est lue dans la source, jamais devinée.
 *
 * Une analyse par produit et par lot de vidéos, partagée entre utilisateurs (cache serveur 7 jours) : l'afficher ne
 * coûte rien ; seule une nouvelle génération compte dans le quota `hookAnalysesPerDay` (Pro 10, Pro+ 50 par jour).
 */
export const HOOK_KIND = 'analyse_accroches';
const CACHE_PREFIX = 'accroches';
const CACHE_DAYS = 7;

export const HOOK_TYPES = ['question', 'probleme', 'resultat', 'demonstration', 'temoignage', 'chiffre', 'curiosite', 'autre'] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export const HOOK_TYPE_LABELS: Record<HookType, string> = {
  question: 'Question',
  probleme: 'Problème',
  resultat: 'Résultat montré',
  demonstration: 'Démonstration',
  temoignage: 'Témoignage',
  chiffre: 'Chiffre',
  curiosite: 'Curiosité',
  autre: 'Autre',
};

const Schema = z.object({
  summary: z.string(),
  videos: z.array(
    z.object({
      index: z.number().int().min(1).max(10),
      hook: z.string(),
      hook_type: z.enum(HOOK_TYPES),
      structure: z.string(),
      why: z.string(),
    }),
  ),
});

export interface HookVideoAnalysis {
  index: number;
  hook: string;
  hook_type: HookType;
  /** Durée lue dans la source (« court, 18 s »), null si inconnue. */
  duration: string | null;
  structure: string;
  why: string;
}

export interface HookAnalysis {
  summary: string;
  videos: HookVideoAnalysis[];
  source: 'ia' | 'simulation';
  generated_at: string;
}

/** « court (18 s) », « moyen (32 s) », « long (75 s) » ; null si la source ne donne pas la durée. */
export function durationLabel(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  const kind = seconds < 20 ? 'court' : seconds <= 45 ? 'moyen' : 'long';
  return `${kind} (${formatInt(seconds)} s)`;
}

const videoText = (v: TopVideo) => (v.hook ? `${v.hook} ${v.title}` : v.title).trim();
const hasText = (v: TopVideo) => v.title !== 'Vidéo sans description' || Boolean(v.hook);

/** Empreinte des vidéos analysées : une nouvelle liste (vidéos rechargées) appelle une nouvelle analyse. */
export function videosFingerprint(videos: TopVideo[]): string {
  const text = videos.map((v) => `${v.url ?? ''}|${v.title}|${v.views ?? ''}`).join('\n');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export const hookCacheKey = (productId: string, videos: TopVideo[]) => `${CACHE_PREFIX}|${productId}|${videosFingerprint(videos)}`;

function firstWords(text: string, max = 12): string {
  const sentence = text.split(/(?<=[.!?…])\s+|\n/)[0] ?? text;
  const words = sentence.trim().split(/\s+/);
  return words.slice(0, max).join(' ') + (words.length > max ? '…' : '');
}

/** Type d'accroche déduit du texte (analyse simulée, sans IA). */
export function guessHookType(text: string): HookType {
  const t = text.toLowerCase();
  if (/\?/.test(t)) return 'question';
  if (/\b(marre|problème|fini les|plus jamais|galère|enfin)\b/.test(t)) return 'probleme';
  if (/\b(avant|après|résultat|regardez|regarde le résultat)\b/.test(t)) return 'resultat';
  if (/\b(test|je teste|démo|démonstration|comment|tuto|voici comment)\b/.test(t)) return 'demonstration';
  if (/\b(j'ai|j’ai|mon avis|depuis que|je l'utilise|je l’utilise|ma routine)\b/.test(t)) return 'temoignage';
  if (/\d/.test(t)) return 'chiffre';
  if (/\b(secret|personne ne|tu savais|astuce|pourquoi)\b/.test(t)) return 'curiosite';
  return 'autre';
}

const STRUCTURES: Record<'court' | 'moyen' | 'long' | 'inconnu', string> = {
  court: 'Format court : l’accroche, le produit en main, puis l’appel à l’action, sans détour.',
  moyen: 'Format moyen : accroche, démonstration du produit, preuve, puis appel à l’action.',
  long: 'Format long : accroche, mise en situation, démonstration détaillée et réponses aux objections.',
  inconnu: 'Durée non fournie par la source : structure difficile à dire, l’accroche reste le point clé.',
};

const WHY: Record<HookType, string> = {
  question: 'Une question directe pousse à rester pour avoir la réponse.',
  probleme: 'Nommer un problème courant fait se sentir concerné dès la première seconde.',
  resultat: 'Montrer le résultat d’abord donne envie de voir comment on y arrive.',
  demonstration: 'Le produit en action répond tout de suite à « est-ce que ça marche ? ».',
  temoignage: 'Un ressenti personnel rend la vidéo crédible et proche.',
  chiffre: 'Un chiffre précis attire l’œil et rend le propos concret.',
  curiosite: 'L’accroche ouvre une boucle de curiosité qu’on veut refermer.',
  autre: 'L’accroche s’appuie surtout sur l’image : le texte seul en dit peu.',
};

export function simulateHookAnalysis(videos: TopVideo[]): Omit<HookAnalysis, 'generated_at'> {
  const analyzed = videos.slice(0, 5).map((video, i) => {
    const text = videoText(video);
    const type = hasText(video) ? guessHookType(text) : 'autre';
    const kind = video.duration_s == null ? 'inconnu' : video.duration_s < 20 ? 'court' : video.duration_s <= 45 ? 'moyen' : 'long';
    return {
      index: i + 1,
      hook: hasText(video) ? firstWords(video.hook ?? video.title) : 'Texte non fourni par la source',
      hook_type: type,
      duration: durationLabel(video.duration_s),
      structure: STRUCTURES[kind],
      why: WHY[type],
    };
  });
  const counts = new Map<HookType, number>();
  for (const v of analyzed) counts.set(v.hook_type, (counts.get(v.hook_type) ?? 0) + 1);
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    summary: top
      ? `Accroche la plus fréquente : ${HOOK_TYPE_LABELS[top[0]].toLowerCase()} (${top[1]} vidéo${top[1] > 1 ? 's' : ''} sur ${analyzed.length}). Analyse simulée à partir du texte, sans IA.`
      : 'Aucune vidéo à analyser.',
    videos: analyzed,
    source: 'simulation',
  };
}

const SYSTEM = `Tu analyses les accroches de vidéos TikTok Shop françaises pour un créateur affilié. Tu n'as que le texte de
chaque vidéo (sa description) et ses chiffres : tu ne vois pas la vidéo. Pour chaque vidéo : recopie l'accroche (les
premiers mots du texte, 12 mots au plus, tels quels ; « Texte non fourni » s'il n'y a pas de texte), donne son type,
décris en une phrase la structure probable d'après le texte et la durée, et dis en une phrase pourquoi elle accroche.
Puis un résumé de 2 phrases : ce qui revient dans les vidéos qui vendent ce produit. Français simple, tutoiement, aucune
promesse de gains ni de résultat, rien d'inventé.`;

function describe(video: TopVideo, index: number): string {
  const figures = [
    video.duration_s != null ? `durée ${video.duration_s} s` : 'durée inconnue',
    video.views != null ? `${formatCompact(video.views)} vues` : null,
    video.estimated_sales != null ? `${formatInt(video.estimated_sales)} ventes estimées` : null,
  ].filter(Boolean);
  return `Vidéo ${index} : ${hasText(video) ? `texte « ${videoText(video).slice(0, 400)} »` : 'pas de texte'} ; ${figures.join(', ')}.`;
}

const clean = (text: string) => findIssues(text.replace(/commissions?/gi, 'part')).length === 0;

const squash = (text: string) => text.toLowerCase().replace(/[«»"“”…]/g, '').replace(/\s+/g, ' ').trim();

/** L'accroche rendue par l'IA doit être recopiée du texte de la vidéo, pas inventée. */
export function hookIsQuoted(hook: string, video: TopVideo): boolean {
  const quoted = squash(hook);
  return quoted.length > 0 && squash(videoText(video)).includes(quoted);
}

/** Génère l'analyse (IA, sinon simulée). Un champ refusé par le garde-fou est remplacé par sa version simulée. */
export async function generateHookAnalysis(videos: TopVideo[]): Promise<HookAnalysis> {
  const list = videos.slice(0, 5);
  const fallback = simulateHookAnalysis(list);
  const answer = await askStructured({
    name: 'analyse_accroches',
    schema: Schema,
    system: SYSTEM,
    prompt: list.map((v, i) => describe(v, i + 1)).join('\n'),
    maxTokens: 2500,
    simulate: () => ({
      summary: fallback.summary,
      videos: fallback.videos.map(({ index, hook, hook_type, structure, why }) => ({ index, hook, hook_type, structure, why })),
    }),
  });
  if (answer.simulated) return { ...fallback, generated_at: new Date().toISOString() };
  const byIndex = new Map(answer.data.videos.map((v) => [v.index, v]));
  return {
    summary: clean(answer.data.summary) ? answer.data.summary.slice(0, 400) : fallback.summary,
    videos: fallback.videos.map((base) => {
      const ai = byIndex.get(base.index);
      if (!ai) return base;
      const video = list[base.index - 1];
      return {
        index: base.index,
        hook: hasText(video) && hookIsQuoted(ai.hook, video) && clean(ai.hook) ? ai.hook.slice(0, 140) : base.hook,
        hook_type: ai.hook_type,
        duration: base.duration,
        structure: clean(ai.structure) ? ai.structure.slice(0, 240) : base.structure,
        why: clean(ai.why) ? ai.why.slice(0, 240) : base.why,
      };
    }),
    source: 'ia',
    generated_at: new Date().toISOString(),
  };
}

function asAnalysis(value: unknown): HookAnalysis | null {
  const v = value as Partial<HookAnalysis> | null;
  return v && typeof v.summary === 'string' && Array.isArray(v.videos) && (v.source === 'ia' || v.source === 'simulation') ? (v as HookAnalysis) : null;
}

export async function readHookAnalysis(product: Pick<Product, 'id' | 'top_videos'>, repo: Repo = getRepo()): Promise<HookAnalysis | null> {
  if (!product.top_videos.length) return null;
  return asAnalysis(await repo.getProviderCache(hookCacheKey(product.id, product.top_videos)));
}

export type HookOutcome = { ok: true; analysis: HookAnalysis; fromCache: boolean } | { ok: false; reason: 'plan' | 'quota' | 'videos' | 'ia' };

/** Analyse demandée depuis la fiche : plan et quota vérifiés ici, côté serveur ; le cache ne coûte rien. */
export async function requestHookAnalysis(
  profile: Pick<Profile, 'id' | 'plan'>,
  product: Pick<Product, 'id' | 'top_videos'>,
  repo: Repo = getRepo(),
): Promise<HookOutcome> {
  const limit = getPlan(profile.plan).hookAnalysesPerDay;
  if (!limit) return { ok: false, reason: 'plan' };
  if (!product.top_videos.length) return { ok: false, reason: 'videos' };
  const cached = await readHookAnalysis(product, repo);
  if (cached) return { ok: true, analysis: cached, fromCache: true };
  if ((await remainingToday(profile.id, HOOK_KIND, limit)) <= 0) return { ok: false, reason: 'quota' };
  let analysis: HookAnalysis;
  try {
    analysis = await generateHookAnalysis(product.top_videos);
  } catch (error) {
    console.error('[accroches]', error instanceof Error ? error.message : error);
    return { ok: false, reason: 'ia' };
  }
  await repo.setProviderCache(hookCacheKey(product.id, product.top_videos), analysis, new Date(Date.now() + CACHE_DAYS * 86_400_000).toISOString());
  await repo.saveRecord(profile.id, HOOK_KIND, { product_id: product.id, source: analysis.source });
  return { ok: true, analysis, fromCache: false };
}
