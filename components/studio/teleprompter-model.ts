/** Règles du téléprompteur, sans interface (testées à part). */

export const MIN_SPEED = 1;
export const MAX_SPEED = 10;
export const DEFAULT_SPEED = 4;
export const SIZES = [28, 34, 40, 48, 56, 64];
export const DEFAULT_SIZE_INDEX = 2;

export type PrompterMode = 'scroll' | 'lines';

/** Avec « animations réduites », pas de défilement continu : une phrase à la fois, qui change d'un coup. */
export function initialMode(prefersReducedMotion: boolean): PrompterMode {
  return prefersReducedMotion ? 'lines' : 'scroll';
}

export function clampSpeed(speed: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(speed)));
}

/** Pixels par seconde en défilement continu (27 à 135). */
export function scrollSpeed(speed: number): number {
  return 15 + clampSpeed(speed) * 12;
}

/** Temps d'affichage d'une phrase en mode « une phrase à la fois » (1,5 à 3,75 mots par seconde, 1,5 s au moins). */
export function lineDuration(text: string, speed: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1500, Math.round((words / (1.25 + clampSpeed(speed) * 0.25)) * 1000));
}

/** Phrases à lire : ce que dit le créateur, plan par plan (les lignes vides sont retirées). */
export function prompterLines(shots: Array<{ voice: string }>): string[] {
  return shots.map((s) => s.voice.trim()).filter(Boolean);
}
