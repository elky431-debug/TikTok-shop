import type { Hook, Product, ScriptFormat, TopVideo, VideoScript } from '@/lib/db/types';

export interface ScriptInput {
  product: Pick<Product, 'id' | 'name' | 'niche' | 'description' | 'price_cents' | 'commission_rate' | 'shop_name'>;
  format: ScriptFormat;
  /** Style de vidéo de l'utilisateur (face_camera, voix_off, mains, avant_apres). */
  style: string | null;
  /** Phrase d'exemple de l'utilisateur, pour copier son ton. */
  examplePhrase: string | null;
  firstName: string | null;
  topVideos: TopVideo[];
}

export interface ScriptOutput {
  hooks: Hook[];
  scripts: VideoScript[];
}
