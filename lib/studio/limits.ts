import type { PlanId } from '@/lib/db/types';
import { SCRIPT_FORMATS, type StudioFormat } from '@/lib/ai/formats';
import { getPlan, MAX_HOOK_REGENERATIONS } from '@/lib/plans';

/**
 * Droits du studio par plan, tous vérifiés côté serveur, tirés de `lib/plans.ts` (scripts par jour, formats, séries de
 * 20 vidéos, style personnel, retouches, traduction, export).
 */
export interface StudioRights {
  /** Générations (10 accroches + 3 scripts) par jour, Infinity = illimité. */
  scriptsPerDay: number;
  /** Séries de 20 angles par jour (0 = fermé). */
  seriesPerDay: number;
  /** Traduction allemand, italien, espagnol. */
  translation: boolean;
  /** Export d'un script en texte et en PDF, et de tout l'historique. */
  export: boolean;
  /** Style personnel tiré de ses vidéos. */
  personalStyle: boolean;
  /** Analyses de style par jour. */
  styleAnalysesPerDay: number;
  /** Retouches IA (ligne, raccourcir, plus percutant, traduction) par génération. */
  editsPerGeneration: number;
  /** Accroches remplacées par génération. */
  hookRegenerations: number;
  /** Formats de vidéo ouverts. */
  formats: StudioFormat[];
}

export function studioRights(plan: PlanId): StudioRights {
  const p = getPlan(plan);
  return {
    scriptsPerDay: p.scriptsPerDay,
    seriesPerDay: p.anglesSeriesPerDay,
    translation: p.scriptTranslation,
    export: p.export,
    personalStyle: p.personalStyle,
    styleAnalysesPerDay: p.styleAnalysesPerDay,
    editsPerGeneration: p.editsPerGeneration,
    hookRegenerations: MAX_HOOK_REGENERATIONS,
    formats: allowedFormats(plan),
  };
}

/** Formats de vidéo ouverts par le plan : les 5 premiers en Starter, les 8 en Pro et Elite. */
export function allowedFormats(plan: PlanId): StudioFormat[] {
  return SCRIPT_FORMATS.slice(0, getPlan(plan).scriptFormats).map((f) => f.id);
}
