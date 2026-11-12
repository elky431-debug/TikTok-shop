import type { Profile, RegionId } from '@/lib/db/types';
import { env } from '@/lib/env';
import type { NicheId } from '@/lib/niches';
import { getPlan } from '@/lib/plans';

/**
 * Pays du catalogue. La France reste le pays par défaut et l'interface reste en français ; l'Allemagne, l'Italie et
 * l'Espagne s'ouvrent avec Pro+. La collecte nocturne ne couvre que les pays de ENABLED_REGIONS (FR par défaut) : un
 * pays non collecté s'affiche vide, avec l'explication, jamais avec des produits d'un autre pays.
 */
export const REGIONS: Record<RegionId, { label: string; language: 'fr' | 'de' | 'it' | 'es' }> = {
  FR: { label: 'France', language: 'fr' },
  DE: { label: 'Allemagne', language: 'de' },
  IT: { label: 'Italie', language: 'it' },
  ES: { label: 'Espagne', language: 'es' },
};
export const REGION_IDS = Object.keys(REGIONS) as RegionId[];

export function isRegionId(value: unknown): value is RegionId {
  return typeof value === 'string' && value in REGIONS;
}

/** Mots-clés de chaque niche, traduits pour chaque pays (recherches et repères dans la langue du marché). */
export const NICHE_KEYWORDS: Record<NicheId, Record<'fr' | 'de' | 'it' | 'es', string[]>> = {
  beaute: { fr: ['sérum', 'soin visage', 'maquillage'], de: ['Serum', 'Gesichtspflege', 'Make-up'], it: ['siero', 'cura del viso', 'trucco'], es: ['sérum', 'cuidado facial', 'maquillaje'] },
  maison: { fr: ['rangement', 'cuisine', 'nettoyage'], de: ['Aufbewahrung', 'Küche', 'Reinigung'], it: ['organizzazione', 'cucina', 'pulizia'], es: ['organización', 'cocina', 'limpieza'] },
  mode: { fr: ['robe', 'ensemble', 'lingerie'], de: ['Kleid', 'Set', 'Unterwäsche'], it: ['vestito', 'completo', 'intimo'], es: ['vestido', 'conjunto', 'lencería'] },
  tech: { fr: ['écouteurs', 'chargeur', 'accessoire téléphone'], de: ['Kopfhörer', 'Ladegerät', 'Handyzubehör'], it: ['auricolari', 'caricatore', 'accessori telefono'], es: ['auriculares', 'cargador', 'accesorios móvil'] },
  sport: { fr: ['fitness', 'gourde', 'tapis de yoga'], de: ['Fitness', 'Trinkflasche', 'Yogamatte'], it: ['fitness', 'borraccia', 'tappetino yoga'], es: ['fitness', 'botella', 'esterilla de yoga'] },
  animaux: { fr: ['chien', 'chat', 'jouet'], de: ['Hund', 'Katze', 'Spielzeug'], it: ['cane', 'gatto', 'gioco'], es: ['perro', 'gato', 'juguete'] },
  bebe: { fr: ['bébé', 'poussette', 'éveil'], de: ['Baby', 'Kinderwagen', 'Lernspielzeug'], it: ['neonato', 'passeggino', 'gioco educativo'], es: ['bebé', 'carrito', 'juguete educativo'] },
};

/** Pays collectés chaque nuit : ENABLED_REGIONS (« FR,DE »), FR toujours inclus. */
export function enabledRegions(): RegionId[] {
  const asked = env.enabledRegions.split(',').map((r) => r.trim().toUpperCase()).filter(isRegionId);
  return ['FR', ...asked.filter((r) => r !== 'FR')];
}

/** Pays du catalogue montré à cet utilisateur : le sien s'il a Pro+, sinon la France. */
export function regionFor(profile: Pick<Profile, 'plan' | 'region'>): RegionId {
  return getPlan(profile.plan).europe && isRegionId(profile.region) ? profile.region : 'FR';
}
