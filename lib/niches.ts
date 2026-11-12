export const NICHES = [
  { id: 'beaute', label: 'Beauté et soins', short: 'Beauté' },
  { id: 'maison', label: 'Maison et cuisine', short: 'Maison' },
  { id: 'mode', label: 'Mode', short: 'Mode' },
  { id: 'tech', label: 'Tech et accessoires', short: 'Tech' },
  { id: 'sport', label: 'Sport et bien-être', short: 'Sport' },
  { id: 'animaux', label: 'Animaux', short: 'Animaux' },
  { id: 'bebe', label: 'Bébé', short: 'Bébé' },
] as const;

export type NicheId = (typeof NICHES)[number]['id'];

export const NICHE_IDS = NICHES.map((n) => n.id) as NicheId[];

export function isNicheId(value: unknown): value is NicheId {
  return typeof value === 'string' && (NICHE_IDS as string[]).includes(value);
}

export function nicheLabel(id: NicheId | string): string {
  return NICHES.find((n) => n.id === id)?.label ?? id;
}

export function nicheShort(id: NicheId | string): string {
  return NICHES.find((n) => n.id === id)?.short ?? id;
}
