import type { Hook, Product, TopVideo, VideoScript } from '@/lib/db/types';
import type { FixedAngle, ScriptSettings, StudioFormat } from './formats';

/** Un script complet du studio : plan par plan, plus les idées de plans de coupe. */
export interface StudioScript extends VideoScript {
  /** Plans de coupe à filmer en plus pour le montage (gros plans, gestes, détails). */
  broll: string[];
}

/** Profil de style tiré des textes des vidéos de l'utilisateur (fiche `style_perso`). */
export interface StyleProfile {
  summary: string;
  tone: string;
  sentence_length: 'courtes' | 'moyennes' | 'longues';
  address: 'tutoiement' | 'vouvoiement' | 'mixte';
  expressions: string[];
  openings: string[];
  closings: string[];
  do: string[];
  avoid: string[];
}

/** Un script bien noté (ou qui a vendu), donné en exemple aux générations suivantes. */
export interface FeedbackExample {
  title: string;
  format: StudioFormat;
  stars: number | null;
  sold: boolean;
  hook: string;
  lines: string[];
}

export interface Feedback {
  best: FeedbackExample[];
  /** Titres des scripts notés 1 ou 2 sur 5 : à ne pas refaire. */
  weak: Array<{ title: string; stars: number }>;
}

/** Angle imposé par une série de 20 vidéos. */
export interface SeriesAngleInput {
  title: string;
  hook: string;
  pitch: string;
  angle: FixedAngle;
}

export interface ScriptInput {
  product: Pick<Product, 'id' | 'name' | 'niche' | 'description' | 'price_cents' | 'commission_rate' | 'shop_name'>;
  format: StudioFormat;
  /** Style de vidéo de l'utilisateur (face_camera, voix_off, mains, avant_apres). */
  style: string | null;
  /** Phrase d'exemple de l'utilisateur, pour copier son ton. */
  examplePhrase: string | null;
  firstName: string | null;
  topVideos: TopVideo[];
  /** Durée, ton, angle (défaut : 30 s, énergique, varié). */
  settings?: ScriptSettings;
  /** Style personnel tiré de ses propres vidéos (Pro et Pro+). */
  personalStyle?: StyleProfile | null;
  /** Ses scripts les mieux notés ou qui ont vendu, et ceux qui lui ont moins plu. */
  feedback?: Feedback | null;
  /** Angle imposé (série de 20 vidéos). */
  seriesAngle?: SeriesAngleInput | null;
  /** Inspiration envoyée par le créateur (analyse de vidéo → studio), déjà balisée comme donnée à adapter. */
  inspiration?: string | null;
}

export interface ScriptOutput {
  hooks: Hook[];
  scripts: StudioScript[];
}
