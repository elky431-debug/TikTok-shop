import type { ScriptSettings, StudioFormat, TranslationLang } from '@/lib/ai/formats';
import type { SeriesAngle } from '@/lib/ai/series';
import type { StudioScript, StyleProfile } from '@/lib/ai/types';
import type { Hook } from '@/lib/db/types';

/** Types de fiches (`user_records`) du studio. */
export const KIND_DOC = 'studio_script';
export const KIND_SERIES = 'studio_serie';
export const KIND_STYLE = 'style_perso';
/** Journal des analyses de style (une ligne par analyse, sans texte) : sert au quota du jour. */
export const KIND_STYLE_LOG = 'style_analyse';

export type ScriptSource = 'claude' | 'openai' | 'simulation';

export interface StudioRating {
  /** 1 à 5, null = pas encore noté. */
  stars: number | null;
  /** « oui » = a vendu, « non » = n'a pas vendu, null = pas encore dit. */
  sold: 'oui' | 'non' | null;
  at: string;
}

export interface StudioTranslation {
  lang: TranslationLang;
  script: StudioScript;
  /** Version du script français traduite : si le script a changé depuis, la traduction est à refaire. */
  version: number;
  simulated: boolean;
  at: string;
}

/**
 * Une génération du studio (fiche `studio_script`) : 10 accroches et 3 scripts, avec leurs retouches, traductions et
 * notes. La ligne de la table `scripts` (`script_id`) reste la trace comptée par l'espace formateur et l'export
 * historique ; son texte complet est tenu à jour à chaque retouche.
 */
export interface StudioDoc {
  script_id: string | null;
  product_id: string;
  product_name: string;
  format: StudioFormat;
  settings: ScriptSettings;
  hooks: Hook[];
  scripts: StudioScript[];
  /** Version précédente de chaque script (une seule retouche annulable). */
  previous: Array<StudioScript | null>;
  /** Numéro de version de chaque script (1 à la génération, +1 à chaque retouche). */
  versions: number[];
  translations: Array<Partial<Record<TranslationLang, StudioTranslation>>>;
  ratings: Array<StudioRating | null>;
  saved: boolean;
  source: ScriptSource;
  /** Style personnel appliqué à la génération. */
  personal_style: boolean;
  /** Nombre de scripts bien notés donnés en exemple à la génération. */
  feedback_used: number;
  series: { id: string; index: number } | null;
  regen_count: number;
  edit_count: number;
  /** Retouches faites en simulé (sans clé d'IA) : affiché honnêtement. */
  simulated_edits: number;
  generated_at: string;
  /** Repris d'une génération antérieure à la session 5 (table `scripts` seule). */
  legacy?: boolean;
}

export type StudioDocView = StudioDoc & { id: string; created_at: string; updated_at: string };

export interface SeriesItem extends SeriesAngle {
  /** Génération écrite à partir de cet angle (fiche `studio_script`), null si pas encore écrite. */
  doc_id: string | null;
}

export interface SeriesData {
  product_id: string;
  product_name: string;
  angles: SeriesItem[];
  simulated: boolean;
  duplicates_removed: number;
  filled: number;
}

export interface StyleData {
  samples: string[];
  profile: StyleProfile;
  enabled: boolean;
  simulated: boolean;
  analyzed_at: string;
  edited_at: string | null;
}
