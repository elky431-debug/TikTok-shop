import { z } from 'zod';
import { Rng } from '@/lib/data/random';
import { formatEuros } from '@/lib/utils';
import {
  durationBounds,
  formatLabel,
  LANG_LABELS,
  LANG_MARKETS,
  shotRange,
  toneLabel,
  type Duration,
  type ScriptSettings,
  type StudioFormat,
  type TranslationLang,
} from './formats';
import { findIssues, stripIssues } from './guard';
import { timeline } from './mock-scripts';
import { describeStyle, EDIT_SYSTEM_PROMPT } from './prompt';
import { askStructured } from './structured';
import type { StudioScript, StyleProfile } from './types';

/**
 * Retouches fines d'un script : réécrire une seule ligne, raccourcir, rendre plus percutant, traduire (allemand,
 * italien, espagnol). Chaque retouche passe par l'IA structurée (OpenAI ou Claude) avec un nouvel essai si la sortie
 * enfreint les interdits, puis le garde-fou retire ce qui reste. Sans clé : une version simulée déterministe.
 */

export interface EditContext {
  product: { name: string; description: string; price_cents: number };
  format: StudioFormat;
  settings: ScriptSettings;
  personalStyle?: StyleProfile | null;
}

export interface EditResult<T> {
  data: T;
  simulated: boolean;
}

const ShotSchema = z.object({ time: z.string(), visual: z.string(), voice: z.string(), on_screen_text: z.string() });
const LineSchema = z.object({ voice: z.string(), on_screen_text: z.string() });
const RewriteSchema = z.object({
  title: z.string(),
  duration_seconds: z.number(),
  shots: z.array(ShotSchema),
  call_to_action: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
});
const TranslationSchema = z.object({
  title: z.string(),
  shots: z.array(z.object({ voice: z.string(), on_screen_text: z.string() })),
  call_to_action: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
});

function scriptForPrompt(script: StudioScript): string {
  return [
    `Titre : ${script.title} (${script.duration_seconds} s)`,
    ...script.shots.map((s, i) => `Plan ${i + 1} [${s.time}] On voit : ${s.visual} | Dit : « ${s.voice} » | Écran : ${s.on_screen_text}`),
    `Appel à l’action : ${script.call_to_action}`,
    `Légende : ${script.caption} ${script.hashtags.join(' ')}`,
  ].join('\n');
}

function contextLines(ctx: EditContext): string[] {
  return [
    `## Produit : ${ctx.product.name} (${formatEuros(ctx.product.price_cents)}) — ${ctx.product.description || 'pas de description'}`,
    `## Format : ${formatLabel(ctx.format)} · ton ${toneLabel(ctx.settings.tone).toLowerCase()}`,
    ...(ctx.personalStyle ? describeStyle(ctx.personalStyle) : []),
  ];
}

function textsOf(data: { voice?: string; on_screen_text?: string; shots?: Array<{ voice: string; on_screen_text: string }>; call_to_action?: string; caption?: string }): string[] {
  return [data.voice, data.on_screen_text, data.call_to_action, data.caption, ...(data.shots ?? []).flatMap((s) => [s.voice, s.on_screen_text])].filter(
    (t): t is string => typeof t === 'string',
  );
}

/** Appel structuré + garde-fou : un nouvel essai avec la liste des problèmes s'il reste un interdit. */
async function askClean<T extends object>(request: {
  name: string;
  schema: z.ZodType<T>;
  prompt: string;
  simulate: () => T;
  maxTokens?: number;
}): Promise<EditResult<T>> {
  let result = await askStructured({ ...request, system: EDIT_SYSTEM_PROMPT, quick: true });
  const problems = textsOf(result.data as never).flatMap((t) => findIssues(t).map((i) => `${i.reason} : « ${t} »`));
  if (problems.length && !result.simulated) {
    result = await askStructured({
      ...request,
      system: EDIT_SYSTEM_PROMPT,
      prompt: `${request.prompt}\n\nAttention, ta réponse précédente ne respectait pas les règles : ${problems.slice(0, 5).join(' ; ')}. Corrige ces points.`,
    });
  }
  return { data: result.data, simulated: result.simulated };
}

// ---------------------------------------------------------------------------
// Une seule ligne
// ---------------------------------------------------------------------------

const LINE_ALTERNATIVES = [
  'Regarde bien, c’est là que ça se joue.',
  'Je te le montre de plus près.',
  'Voilà ce que ça donne, en vrai.',
  'Simple, rapide, et je te montre comment.',
  'C’est ce détail-là qui m’a convaincu.',
  'Je refais le geste, regarde.',
];

export function simulateLine(script: StudioScript, index: number, salt: string): { voice: string; on_screen_text: string } {
  const shot = script.shots[index];
  const rng = new Rng(`${script.title}|${index}|${salt}`);
  const isLast = index === script.shots.length - 1;
  if (index === 0) {
    const options = ['Attends, regarde ça.', 'Deux secondes, je te montre.', 'Tu vas vouloir voir ça.', 'Je ne m’attendais pas à ça.'];
    const voice = rng.shuffle(options).find((o) => o !== shot.voice) ?? options[0];
    return { voice, on_screen_text: voice };
  }
  if (isLast) {
    const options = ['C’est dans le panier orange, juste en dessous.', 'Il t’attend dans le panier orange, juste en dessous.', 'Panier orange, juste en dessous : fais-toi ton avis.'];
    const voice = rng.shuffle(options).find((o) => o !== shot.voice) ?? options[0];
    return { voice, on_screen_text: 'Panier orange, juste en dessous' };
  }
  const voice = rng.shuffle(LINE_ALTERNATIVES).find((o) => o !== shot.voice) ?? LINE_ALTERNATIVES[0];
  return { voice, on_screen_text: shot.on_screen_text };
}

export async function rewriteLine(script: StudioScript, index: number, ctx: EditContext, salt = String(Date.now())): Promise<EditResult<{ voice: string; on_screen_text: string }>> {
  const shot = script.shots[index];
  const result = await askClean({
    name: 'ligne_script',
    schema: LineSchema,
    prompt: [
      ...contextLines(ctx),
      '## Script complet',
      scriptForPrompt(script),
      `## À réécrire : le plan ${index + 1} [${shot.time}] (on voit : ${shot.visual})`,
      `Phrase actuelle : « ${shot.voice} » · texte à l’écran : « ${shot.on_screen_text} »`,
      `Écris une autre phrase pour ce plan seulement, de longueur proche, qui s’enchaîne avec le plan d’avant et celui d’après, et un texte à l’écran court.${
        index === script.shots.length - 1 ? ' C’est l’appel à l’action : renvoie vers le panier orange.' : ''
      }${index === 0 ? ' C’est l’accroche : 8 mots au plus.' : ''}`,
    ].join('\n'),
    maxTokens: 800,
    simulate: () => simulateLine(script, index, salt),
  });
  const voice = stripIssues(result.data.voice.trim()) || shot.voice;
  const onScreen = stripIssues(result.data.on_screen_text.trim()) || shot.on_screen_text;
  return { data: { voice, on_screen_text: onScreen }, simulated: result.simulated };
}

// ---------------------------------------------------------------------------
// Raccourcir, rendre plus percutant
// ---------------------------------------------------------------------------

/** Durée visée quand on raccourcit : 60 → 30, 30 → 15, 15 reste 15 (texte resserré). */
export function shorterDuration(current: number): Duration {
  if (current > 40) return 30;
  return 15;
}

const FILLERS = /\b(vraiment|franchement|en fait|juste|un peu|carrément|littéralement|honnêtement|tout simplement|du coup)\b,?\s*/gi;

function firstSentenceOf(text: string): string {
  const parts = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  return parts[0] ?? text;
}

function wordCount(script: StudioScript): number {
  return script.shots.reduce((n, s) => n + s.voice.split(/\s+/).filter(Boolean).length, 0);
}

function retime(script: StudioScript, duration: number): StudioScript {
  const times = timeline(duration, script.shots.length);
  return { ...script, duration_seconds: duration, shots: script.shots.map((s, i) => ({ ...s, time: times[i] })) };
}

export function simulateShorter(script: StudioScript): StudioScript {
  const target = shorterDuration(script.duration_seconds);
  const [, maxShots] = shotRange(target);
  let shots = script.shots;
  if (shots.length > maxShots) {
    // Garde l'accroche, l'appel à l'action et les plans du milieu les plus courts.
    const middle = shots
      .slice(1, -1)
      .map((s, i) => ({ s, i }))
      .sort((a, b) => a.s.voice.length - b.s.voice.length)
      .slice(0, maxShots - 2)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.s);
    shots = [shots[0], ...middle, shots[shots.length - 1]];
  }
  shots = shots.map((s, i) => ({ ...s, voice: i === shots.length - 1 ? s.voice : firstSentenceOf(s.voice) }));
  return retime({ ...script, shots }, target);
}

function punch(text: string): string {
  const cleaned = text.replace(FILLERS, '').replace(/\s{2,}/g, ' ').trim();
  // Coupe les phrases longues à la première virgule : deux phrases courtes valent mieux qu'une longue.
  return cleaned
    .split(/(?<=[.!?…])\s+/)
    .map((s) => {
      const words = s.split(/\s+/);
      if (words.length <= 12) return s;
      const comma = s.indexOf(', ');
      return comma > 10 ? `${s.slice(0, comma)}. ${s.charAt(comma + 2).toUpperCase()}${s.slice(comma + 3)}` : s;
    })
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export function simulatePunchier(script: StudioScript): StudioScript {
  const shots = script.shots.map((s, i) => {
    const voice = punch(s.voice);
    const onScreen = s.on_screen_text.split(/\s+/).slice(0, 5).join(' ');
    return { ...s, voice: i === 0 ? voice.split(/\s+/).slice(0, 8).join(' ') : voice, on_screen_text: onScreen };
  });
  return { ...script, shots, caption: punch(script.caption) };
}

function applyRewrite(script: StudioScript, data: z.infer<typeof RewriteSchema>, duration: number): StudioScript {
  const shots = data.shots
    .map((s) => ({ time: s.time.trim(), visual: s.visual.trim(), voice: stripIssues(s.voice.trim()), on_screen_text: stripIssues(s.on_screen_text.trim()) }))
    .filter((s) => s.voice);
  if (shots.length < 2) return script;
  const [low, high] = durationBounds(duration as Duration).clamp;
  return {
    ...script,
    title: data.title.trim() || script.title,
    duration_seconds: Math.min(high, Math.max(low, Math.round(data.duration_seconds || duration))),
    shots,
    call_to_action: stripIssues(data.call_to_action.trim()) || script.call_to_action,
    caption: stripIssues(data.caption.trim()) || script.caption,
    hashtags: data.hashtags.length
      ? data.hashtags.map((t) => `#${t.replace(/^#+/, '').replace(/\s+/g, '')}`).filter((t) => t.length > 1).slice(0, 6)
      : script.hashtags,
  };
}

export async function shortenScript(script: StudioScript, ctx: EditContext): Promise<EditResult<StudioScript>> {
  const target = shorterDuration(script.duration_seconds);
  const [minShots, maxShots] = shotRange(target);
  const result = await askClean({
    name: 'script_raccourci',
    schema: RewriteSchema,
    prompt: [
      ...contextLines(ctx),
      '## Script actuel',
      scriptForPrompt(script),
      `Raccourcis ce script à ${target} secondes (${minShots} à ${maxShots} plans) : garde l’accroche, la preuve la plus forte et l’appel à l’action vers le panier orange. Moins de mots, même idée, même ton. Recalcule les plages de temps.`,
    ].join('\n'),
    maxTokens: 3000,
    simulate: () => simulateShorter(script) as z.infer<typeof RewriteSchema>,
  });
  if (result.simulated) return { data: simulateShorter(script), simulated: true };
  const out = applyRewrite(script, result.data, target);
  // Une version « raccourcie » plus longue que l'original est refusée : on garde la version simulée, honnête.
  return wordCount(out) < wordCount(script) ? { data: out, simulated: false } : { data: simulateShorter(script), simulated: true };
}

export async function punchierScript(script: StudioScript, ctx: EditContext): Promise<EditResult<StudioScript>> {
  const result = await askClean({
    name: 'script_percutant',
    schema: RewriteSchema,
    prompt: [
      ...contextLines(ctx),
      '## Script actuel',
      scriptForPrompt(script),
      'Rends ce script plus percutant : accroche plus directe (8 mots au plus), phrases plus courtes, verbes d’action, pas de mots de remplissage, textes à l’écran de 5 mots au plus. Même durée, mêmes plans, mêmes informations (n’ajoute aucune caractéristique ni aucun chiffre), appel à l’action vers le panier orange.',
    ].join('\n'),
    maxTokens: 3000,
    simulate: () => simulatePunchier(script) as z.infer<typeof RewriteSchema>,
  });
  if (result.simulated) return { data: simulatePunchier(script), simulated: true };
  return { data: applyRewrite(script, result.data, script.duration_seconds), simulated: false };
}

// ---------------------------------------------------------------------------
// Traduction pour les marchés européens (allemand, italien, espagnol)
// ---------------------------------------------------------------------------

const MARKET_NOTES: Record<TranslationLang, string> = {
  de: 'Allemand courant (« du », jamais « Sie »), comme un créateur TikTok allemand. Le panier orange se dit « der orangefarbene Warenkorb ».',
  it: 'Italien courant (« tu »), comme un créateur TikTok italien. Le panier orange se dit « il carrello arancione ».',
  es: 'Espagnol d’Espagne courant (« tú »), comme un créateur TikTok espagnol. Le panier orange se dit « el carrito naranja ».',
};

/** Traduction simulée : impossible sans IA. Le texte reste en français, marqué, pour montrer où il ira. */
export function simulateTranslation(script: StudioScript, lang: TranslationLang): z.infer<typeof TranslationSchema> {
  const mark = `[${lang.toUpperCase()}]`;
  return {
    title: `${mark} ${script.title}`,
    shots: script.shots.map((s) => ({ voice: `${mark} ${s.voice}`, on_screen_text: `${mark} ${s.on_screen_text}` })),
    call_to_action: `${mark} ${script.call_to_action}`,
    caption: `${mark} ${script.caption}`,
    hashtags: script.hashtags.filter((h) => h !== '#publicité'),
  };
}

export async function translateScript(script: StudioScript, lang: TranslationLang, ctx: EditContext): Promise<EditResult<StudioScript>> {
  const result = await askStructured({
    quick: true,
    name: 'traduction_script',
    schema: TranslationSchema,
    system: EDIT_SYSTEM_PROMPT,
    prompt: [
      ...contextLines(ctx),
      '## Script à adapter',
      scriptForPrompt(script),
      `Adapte ce script pour TikTok Shop ${LANG_MARKETS[lang]} : traduis en ${LANG_LABELS[lang].toLowerCase()} ce que dit le créateur, le texte à l’écran, l’appel à l’action, la légende et les hashtags (hashtags dans la langue du pays, sans mention publicitaire : elle est ajoutée ensuite). ${MARKET_NOTES[lang]} Garde exactement le même nombre de plans (${script.shots.length}), dans le même ordre, le même sens, aucune promesse, aucun chiffre ajouté. Ce qu’on voit à l’écran reste en français (c’est pour le créateur).`,
    ].join('\n'),
    maxTokens: 3000,
    simulate: () => simulateTranslation(script, lang),
  });
  const data = result.data;
  const shots = script.shots.map((s, i) => ({
    ...s,
    voice: data.shots[i]?.voice.trim() || s.voice,
    on_screen_text: data.shots[i]?.on_screen_text.trim() || s.on_screen_text,
  }));
  return {
    data: {
      ...script,
      title: data.title.trim() || script.title,
      shots,
      call_to_action: data.call_to_action.trim() || script.call_to_action,
      caption: data.caption.trim(),
      hashtags: data.hashtags.map((t) => `#${t.replace(/^#+/, '').replace(/\s+/g, '')}`).filter((t) => t.length > 1).slice(0, 6),
      disclosure: '',
    },
    simulated: result.simulated,
  };
}
