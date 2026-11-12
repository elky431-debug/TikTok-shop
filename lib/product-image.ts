import { hashString } from '@/lib/data/random';
import type { NicheId } from '@/lib/niches';

/** Fonds doux par niche (légèrement variés par produit) et pictogramme simple. */
const PALETTES: Record<NicheId, Array<[string, string]>> = {
  beaute: [['#FFE4EA', '#FFC9D5'], ['#FBE7F1', '#F6CCE0'], ['#FFEDE4', '#FFD5C2']],
  maison: [['#E7F3EE', '#CBE6DA'], ['#F2EFE6', '#E3DCC8'], ['#E9F1F7', '#CFE0EE']],
  mode: [['#EFE9F8', '#DCCFF2'], ['#F7EDE6', '#EBD5C5'], ['#EAEFF7', '#D2DCEE']],
  tech: [['#E3FBFA', '#BFF3F1'], ['#E8ECF5', '#CDD6EA'], ['#EDEFF2', '#D6DAE1']],
  sport: [['#EAF7E4', '#CFEDC2'], ['#FFF4DF', '#FFE3AE'], ['#E5F4F8', '#C3E6EF']],
  animaux: [['#FFF1E2', '#FFDDB8'], ['#F3EEE6', '#E4D8C6'], ['#EEF6E7', '#D6EBC5']],
  bebe: [['#E8F2FF', '#CFE2FF'], ['#FFF0F4', '#FFD9E3'], ['#F0FAF4', '#D4F1E0']],
};

const ICONS: Record<NicheId, string> = {
  beaute:
    '<rect x="160" y="150" width="80" height="150" rx="22"/><rect x="180" y="118" width="40" height="36" rx="6"/><path d="M186 118v-24a14 14 0 0 1 28 0v24"/><path d="M178 210h44"/>',
  maison:
    '<path d="M120 190h160v70a40 40 0 0 1-40 40h-80a40 40 0 0 1-40-40z"/><path d="M100 190h200"/><path d="M180 190v-22a20 20 0 0 1 40 0v22"/><path d="M290 205h22"/><path d="M88 205h22"/>',
  mode:
    '<path d="M160 110l-58 30 22 48 30-12v128h92V176l30 12 22-48-58-30c-6 18-22 28-40 28s-34-10-40-28z"/>',
  tech:
    '<rect x="132" y="150" width="136" height="110" rx="48"/><path d="M132 200h136"/><circle cx="200" cy="228" r="6"/><path d="M168 150c0-26 14-40 32-40s32 14 32 40"/>',
  sport:
    '<rect x="96" y="168" width="26" height="64" rx="8"/><rect x="122" y="152" width="26" height="96" rx="8"/><rect x="278" y="168" width="26" height="64" rx="8"/><rect x="252" y="152" width="26" height="96" rx="8"/><path d="M148 200h104"/>',
  animaux:
    '<ellipse cx="200" cy="236" rx="46" ry="38"/><ellipse cx="150" cy="178" rx="18" ry="24"/><ellipse cx="250" cy="178" rx="18" ry="24"/><ellipse cx="182" cy="140" rx="16" ry="22"/><ellipse cx="218" cy="140" rx="16" ry="22"/>',
  bebe:
    '<rect x="164" y="164" width="72" height="140" rx="26"/><path d="M176 164v-18h48v18"/><path d="M188 146c0-30 6-44 12-44s12 14 12 44"/><path d="M180 210h20M180 238h20M180 266h20"/>',
};

export function productImageSvg(productId: string, niche: NicheId): string {
  const h = hashString(productId);
  const [bg, accent] = PALETTES[niche][h % PALETTES[niche].length];
  const rotate = ((h >> 4) % 13) - 6;
  const dx = ((h >> 8) % 41) - 20;
  const dy = ((h >> 12) % 31) - 15;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img">
  <rect width="400" height="400" fill="${bg}"/>
  <circle cx="${300 + dx}" cy="${96 + dy}" r="${70 + (h % 30)}" fill="${accent}"/>
  <circle cx="${88 - dx}" cy="${330 - dy}" r="${44 + ((h >> 3) % 24)}" fill="${accent}" opacity=".7"/>
  <g transform="rotate(${rotate} 200 200)" fill="none" stroke="#161823" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">${ICONS[niche]}</g>
</svg>`;
}

/** Visuel SVG de repli d'un produit (toujours disponible, aucune image externe). */
export function fallbackImageUrl(productId: string, niche: NicheId): string {
  return `/api/produit-image/${encodeURIComponent(productId)}?niche=${niche}`;
}
