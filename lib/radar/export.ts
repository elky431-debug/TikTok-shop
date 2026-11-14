import type { ProductView, RadarItem } from '@/lib/radar';
import { nicheLabel } from '@/lib/niches';
import { TREND_LABELS } from '@/lib/score';
import { BADGES } from './badges';

/**
 * Export CSV du radar filtré (Elite). Format pensé pour Excel en français : séparateur « ; », virgule décimale,
 * UTF-8 avec BOM, fins de ligne CRLF (RFC 4180). Une cellule qui commence par =, +, -, @ est préfixée d'une apostrophe
 * (un nom de produit ne doit jamais devenir une formule). Une donnée inconnue reste une cellule vide.
 */
const SEP = ';';

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  // Un nombre reste un nombre (−25 %) ; seul un texte qui commence comme une formule est neutralisé.
  const text = typeof value === 'number' ? String(value).replace('.', ',') : /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const COLUMNS: Array<[string, (p: ProductView, rank: number, siteUrl: string) => string | number | null]> = [
  ['Rang', (_p, rank) => rank],
  ['Produit', (p) => p.name],
  ['Niche', (p) => nicheLabel(p.niche)],
  ['Catégorie TikTok Shop', (p) => (p.figures.category.length ? p.figures.category.join(' > ') : null)],
  ['Boutique', (p) => p.shop_name || null],
  ['Prix (€)', (p) => p.price_cents / 100],
  ['Commission (%)', (p) => Math.round(p.commission_rate * 1000) / 10],
  ['Commission par vente (€)', (p) => p.commission_cents / 100],
  ['Ventes 7 jours (estimées)', (p) => p.figures.sales_7d],
  ['Ventes 30 jours (estimées)', (p) => p.figures.sales_30d],
  ['Croissance 7 jours (%)', (p) => (p.figures.growth_7d === null ? null : Math.round(p.figures.growth_7d * 100))],
  ['Tendance', (p) => (p.growth_known ? TREND_LABELS[p.trend] : 'En mesure')],
  ['Affiliés', (p) => p.active_affiliates],
  ['Note', (p) => p.figures.rating],
  ['Avis', (p) => p.figures.review_count],
  ['Premier relevé de la source', (p) => p.figures.first_seen],
  ['Score', (p) => p.score],
  ['Score pour toi', (p) => p.personal_score],
  ['Badges', (p) => p.badges.map((b) => BADGES[b].label).join(', ') || null],
  ['Pourquoi maintenant', (p) => p.why_now?.sentence ?? null],
  ['Produit fictif', (p) => (p.demo ? 'oui' : 'non')],
  ['Fiche', (p, _rank, siteUrl) => `${siteUrl}/app/produit/${encodeURIComponent(p.id)}`],
  ['Titre complet', (p) => p.full_name],
];

/** Seuls les produits visibles pour ce plan sont exportés : jamais un produit verrouillé. */
export function radarToCsv(items: RadarItem[], siteUrl: string): string {
  const rows = [COLUMNS.map(([title]) => csvCell(title)).join(SEP)];
  for (const item of items) {
    if (item.kind !== 'visible') continue;
    rows.push(COLUMNS.map(([, get]) => csvCell(get(item.product, item.rank, siteUrl))).join(SEP));
  }
  return `﻿${rows.join('\r\n')}\r\n`;
}
