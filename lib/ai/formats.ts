import type { ScriptFormat } from '@/lib/db/types';

/**
 * Formats de vidéo du studio. Les cinq premiers existent depuis le jalon 4 (type `ScriptFormat` de la base) ;
 * comparaison, routine et top 3 arrivent avec la session 5 (contrainte SQL élargie par la migration
 * `20261115000410_studio_huit_formats.sql`).
 */
export type StudioFormat = ScriptFormat | 'comparaison' | 'routine' | 'top3';

export const SCRIPT_FORMATS: Array<{ id: StudioFormat; label: string; hint: string }> = [
  { id: 'demo', label: 'Démo face caméra', hint: 'Tu montres le produit en action et tu parles à la caméra.' },
  { id: 'avant_apres', label: 'Avant-après', hint: 'Le résultat en deux temps, sans retouche.' },
  { id: 'histoire', label: 'Histoire perso', hint: 'Ton problème, ta découverte, ce qui a changé.' },
  { id: 'reponse_commentaire', label: 'Réponse à un commentaire', hint: 'Tu réponds à une question d’un abonné.' },
  { id: 'unboxing', label: 'Déballage', hint: 'Tu ouvres le colis et tu découvres le produit en direct.' },
  { id: 'comparaison', label: 'Comparaison', hint: 'Face à ce que tu utilisais avant, critère par critère.' },
  { id: 'routine', label: 'Routine', hint: 'Le produit à sa place dans ta routine, étape par étape.' },
  { id: 'top3', label: 'Top 3', hint: 'Trois raisons ou trois usages, du plus simple au plus fort.' },
];

export function isScriptFormat(value: unknown): value is StudioFormat {
  return SCRIPT_FORMATS.some((f) => f.id === value);
}

export function formatLabel(id: StudioFormat | string): string {
  return SCRIPT_FORMATS.find((f) => f.id === id)?.label ?? id;
}

// ---------------------------------------------------------------------------
// Réglages : durée, ton, angle
// ---------------------------------------------------------------------------

export const DURATIONS = [15, 30, 60] as const;
export type Duration = (typeof DURATIONS)[number];

export const DURATION_HINTS: Record<Duration, string> = {
  15: 'Une idée, une preuve, le panier.',
  30: 'Le format le plus courant.',
  60: 'Pour démontrer en détail.',
};

export const TONES = [
  { id: 'energique', label: 'Énergique', hint: 'Rythme rapide, phrases très courtes.' },
  { id: 'calme', label: 'Calme', hint: 'Posé, doux, on prend le temps de montrer.' },
  { id: 'humour', label: 'Humour', hint: 'Autodérision légère, sans se moquer de personne.' },
  { id: 'expert', label: 'Expert', hint: 'Précis : comment c’est fait, comment ça s’utilise.' },
] as const;
export type Tone = (typeof TONES)[number]['id'];

export const ANGLES = [
  { id: 'varie', label: 'Varié', hint: 'Trois angles différents, un par script.' },
  { id: 'probleme', label: 'Problème résolu', hint: 'Un souci concret du quotidien, et comment le produit s’en occupe.' },
  { id: 'transformation', label: 'Transformation', hint: 'Le avant / après, le changement visible.' },
  { id: 'objection', label: 'Objection levée', hint: 'La question qui fait hésiter, et la réponse en images.' },
  { id: 'prix', label: 'Rapport qualité-prix', hint: 'Ce qu’on a pour ce prix, sans exagérer.' },
] as const;
export type AngleId = (typeof ANGLES)[number]['id'];
/** Angles « fermés » (hors « varié ») : ceux d'une série de 20 vidéos. */
export type FixedAngle = Exclude<AngleId, 'varie'>;
export const FIXED_ANGLES = ANGLES.filter((a) => a.id !== 'varie').map((a) => a.id) as FixedAngle[];

export interface ScriptSettings {
  duration: Duration;
  tone: Tone;
  angle: AngleId;
}

export const DEFAULT_SETTINGS: ScriptSettings = { duration: 30, tone: 'energique', angle: 'varie' };

export function isDuration(value: unknown): value is Duration {
  return DURATIONS.some((d) => d === Number(value));
}
export function isTone(value: unknown): value is Tone {
  return TONES.some((t) => t.id === value);
}
export function isAngle(value: unknown): value is AngleId {
  return ANGLES.some((a) => a.id === value);
}

/** Réglages lus d'un formulaire : toute valeur inconnue retombe sur la valeur par défaut. */
export function parseSettings(input: { duration?: unknown; tone?: unknown; angle?: unknown }, base: ScriptSettings = DEFAULT_SETTINGS): ScriptSettings {
  return {
    duration: isDuration(input.duration) ? (Number(input.duration) as Duration) : base.duration,
    tone: isTone(input.tone) ? input.tone : base.tone,
    angle: isAngle(input.angle) ? input.angle : base.angle,
  };
}

export function toneLabel(id: string | null | undefined): string {
  return TONES.find((t) => t.id === id)?.label ?? 'Naturel';
}
export function angleLabel(id: string | null | undefined): string {
  return ANGLES.find((a) => a.id === id)?.label ?? 'Varié';
}

/** Durées acceptées pour une cible (validation) et bornes appliquées (mise en forme). */
export function durationBounds(target: Duration): { accept: [number, number]; clamp: [number, number] } {
  if (target === 15) return { accept: [10, 22], clamp: [12, 20] };
  if (target === 60) return { accept: [40, 75], clamp: [45, 70] };
  return { accept: [15, 45], clamp: [20, 40] };
}

/** Nombre de plans conseillé pour une durée. */
export function shotRange(target: Duration): [number, number] {
  if (target === 15) return [3, 4];
  if (target === 60) return [6, 9];
  return [4, 6];
}

// ---------------------------------------------------------------------------
// Mention de collaboration commerciale (loi n° 2023-451 du 9 juin 2023, article 5)
// ---------------------------------------------------------------------------

/** Rappel ajouté à chaque script : la collaboration commerciale doit être signalée. */
export const DISCLOSURE_LINE =
  'Mention obligatoire : affiche « Collaboration commerciale » (ou « Publicité ») à l’écran pendant toute la vidéo, garde #publicité dans la légende et active l’option « contenu commercial » de TikTok.';

export type ScriptLang = 'fr' | 'de' | 'it' | 'es';
export const TRANSLATION_LANGS = ['de', 'it', 'es'] as const;
export type TranslationLang = (typeof TRANSLATION_LANGS)[number];

export const LANG_LABELS: Record<ScriptLang, string> = { fr: 'Français', de: 'Allemand', it: 'Italien', es: 'Espagnol' };
export const LANG_MARKETS: Record<TranslationLang, string> = { de: 'Allemagne', it: 'Italie', es: 'Espagne' };

export function isTranslationLang(value: unknown): value is TranslationLang {
  return TRANSLATION_LANGS.some((l) => l === value);
}

/** Hashtag et mention à l'écran attendus dans chaque langue. */
export const COMMERCIAL_TAG: Record<ScriptLang, string> = { fr: '#publicité', de: '#Werbung', it: '#pubblicità', es: '#publicidad' };
export const ON_SCREEN_MENTION: Record<ScriptLang, string> = {
  fr: 'Collaboration commerciale',
  de: 'Werbung',
  it: 'Pubblicità',
  es: 'Publicidad',
};

/** Rappel (en français, pour toi) de la mention à afficher dans la version traduite. */
export function disclosureFor(lang: ScriptLang): string {
  if (lang === 'fr') return DISCLOSURE_LINE;
  return `Mention obligatoire : affiche « ${ON_SCREEN_MENTION[lang]} » à l’écran pendant toute la vidéo, garde ${COMMERCIAL_TAG[lang]} dans la légende et active l’option « contenu commercial » de TikTok.`;
}
