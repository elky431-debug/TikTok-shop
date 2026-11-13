import type { PlanId } from '@/lib/db/types';
import { getPlan, isPaidPlan, MAX_HOOK_REGENERATIONS } from '@/lib/plans';

/**
 * Droits du studio par plan, tous vérifiés côté serveur. Les quotas de la session 5 viennent de `lib/plans.ts`
 * (scripts par jour, séries de 20 angles, traduction, export) ; les limites propres au studio (style personnel,
 * retouches) sont ici, faute de champ dans `lib/plans.ts` (à y déplacer si besoin).
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
}

const STUDIO_EXTRA: Record<PlanId, Pick<StudioRights, 'styleAnalysesPerDay' | 'editsPerGeneration'>> = {
  free: { styleAnalysesPerDay: 0, editsPerGeneration: 5 },
  pro: { styleAnalysesPerDay: 5, editsPerGeneration: 20 },
  proplus: { styleAnalysesPerDay: 20, editsPerGeneration: 60 },
};

export function studioRights(plan: PlanId): StudioRights {
  const p = getPlan(plan);
  const extra = STUDIO_EXTRA[p.id] ?? STUDIO_EXTRA.free;
  return {
    scriptsPerDay: p.scriptsPerDay,
    seriesPerDay: p.anglesSeriesPerDay,
    translation: p.scriptTranslation,
    export: p.export,
    personalStyle: isPaidPlan(p.id),
    styleAnalysesPerDay: extra.styleAnalysesPerDay,
    editsPerGeneration: extra.editsPerGeneration,
    hookRegenerations: MAX_HOOK_REGENERATIONS,
  };
}
