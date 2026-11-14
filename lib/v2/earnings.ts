import { formatLabel, SCRIPT_FORMATS } from '@/lib/ai/formats';
import type { ScriptFormat } from '@/lib/db/types';
import { NICHES, nicheShort, type NicheId } from '@/lib/niches';
import { addDays, parisDate } from '@/lib/utils';
import { displayName } from '@/lib/product-name';

/**
 * Suivi des gains : saisie à la main ou import CSV (relevé exporté de TikTok Shop, tableur…). Aucune connexion au
 * compte TikTok : l'utilisateur apporte ses propres chiffres. Aucun calcul ni conseil fiscal.
 */
export interface EarningData {
  /** AAAA-MM-JJ */
  date: string;
  product_name: string;
  product_id: string | null;
  /** Repère libre de la vidéo (titre, lien, numéro). null = gain du produit, sans vidéo précise. */
  video: string | null;
  amount_cents: number;
  sales: number | null;
  source: 'saisie' | 'import';
  /** Format de la vidéo (facultatif). */
  format?: ScriptFormat | null;
  /** Niche du produit (facultative ; déduite du produit suivi quand il est reconnu). */
  niche?: NicheId | null;
}

export const EARNINGS_KIND = 'gain';
/** Correspondance des colonnes mémorisée (réglage). */
export const CSV_MAPPING_KIND = 'import_csv';
/** Fichier en attente du choix des colonnes. */
export const PENDING_IMPORT_KIND = 'import_attente';
/** Objectif mensuel. */
export const EARNINGS_GOAL_KIND = 'objectif_gains';
export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_IMPORT_ROWS = 2000;

export type EarningField = 'date' | 'product_name' | 'amount_cents' | 'video' | 'sales' | 'format' | 'niche';
export type CsvMapping = Partial<Record<EarningField, string>>;

export const EARNING_FIELDS: Array<{ key: EarningField; label: string; required: boolean; hint?: string }> = [
  { key: 'date', label: 'Date', required: true, hint: '12/11/2026 ou 2026-11-12' },
  { key: 'product_name', label: 'Produit', required: true },
  { key: 'amount_cents', label: 'Montant gagné', required: true, hint: '12,50 ou 12.50 (en euros)' },
  { key: 'video', label: 'Vidéo', required: false, hint: 'titre, lien ou numéro' },
  { key: 'sales', label: 'Ventes', required: false },
  { key: 'format', label: 'Format de la vidéo', required: false },
  { key: 'niche', label: 'Niche', required: false },
];

const HEADER_ALIASES: Record<EarningField, string[]> = {
  date: ['date', 'jour', 'day', 'date de commande', 'order date'],
  product_name: ['produit', 'product', 'nom du produit', 'product name', 'article'],
  video: ['video', 'vidéo', 'lien', 'video link', 'contenu'],
  amount_cents: ['montant', 'gain', 'gains', 'commission', 'commissions', 'amount', 'earnings', 'revenu'],
  sales: ['ventes', 'commandes', 'sales', 'orders', 'quantité'],
  format: ['format', 'type de video', 'type de vidéo'],
  niche: ['niche', 'categorie', 'catégorie', 'category'],
};

export interface MappingSettings {
  mapping: CsvMapping;
  headers: string[];
  updated_at: string;
}

export interface PendingImport {
  text: string;
  file_name: string | null;
}

export interface EarningsGoal {
  monthly_cents: number;
}

export const normalizeText = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^"|"$/g, '');

/** Découpe une ligne CSV (guillemets doublés gérés). */
function splitLine(line: string, sep: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      cells.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/** « 12,50 € », « 1 234,5 », « 12.50 » → centimes. null si illisible. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[€\s  ]/g, '').replace(/EUR/i, '');
  if (!cleaned) return null;
  const normalized = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/** « 12/11/2026 », « 2026-11-12 », « 12-11-2026 » → AAAA-MM-JJ. null si illisible ou date impossible. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  let iso: string | null = null;
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** Format de vidéo reconnu dans un texte libre (« Démo », « avant-après », « unboxing »…). */
export function parseFormat(raw: string | null | undefined): ScriptFormat | null {
  const s = normalizeText(raw ?? '');
  if (!s) return null;
  const exact = SCRIPT_FORMATS.find((f) => f.id === s.replace(/[\s-]+/g, '_') || normalizeText(f.label) === s);
  if (exact) return exact.id;
  if (/avant|apres/.test(s)) return 'avant_apres';
  if (/deball|unbox|colis/.test(s)) return 'unboxing';
  if (/comment|reponse|question/.test(s)) return 'reponse_commentaire';
  if (/histoire|story|perso|storytime/.test(s)) return 'histoire';
  if (/demo|face|camera|test/.test(s)) return 'demo';
  return null;
}

/** Niche reconnue dans un texte libre (identifiant, nom long ou court). */
export function parseNiche(raw: string | null | undefined): NicheId | null {
  const s = normalizeText(raw ?? '');
  if (!s) return null;
  return NICHES.find((n) => n.id === s || normalizeText(n.label) === s || normalizeText(n.short) === s)?.id ?? null;
}

export interface CsvTable {
  separator: string;
  headers: string[];
  rows: string[][];
}

/** Lit le tableau brut : séparateur détecté (; , ou tabulation), en-têtes et lignes. */
export function readCsv(text: string): CsvTable {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { separator: ';', headers: [], rows: [] };
  const separator = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  return { separator, headers: splitLine(lines[0], separator), rows: lines.slice(1).map((l) => splitLine(l, separator)) };
}

/** Colonnes devinées d'après les noms courants (proposées à l'écran de choix, jamais imposées). */
export function guessMapping(headers: string[]): CsvMapping {
  const mapping: CsvMapping = {};
  for (const field of Object.keys(HEADER_ALIASES) as EarningField[]) {
    const found = headers.find((h) => HEADER_ALIASES[field].includes(normalizeText(h)));
    if (found) mapping[field] = found;
  }
  return mapping;
}

/** La correspondance mémorisée s'applique-t-elle à ce fichier ? (colonnes obligatoires présentes, toutes trouvées) */
export function mappingFits(mapping: CsvMapping, headers: string[]): boolean {
  const names = new Set(headers.map(normalizeText));
  const required = EARNING_FIELDS.filter((f) => f.required).every((f) => mapping[f.key]);
  return required && Object.values(mapping).every((col) => !col || names.has(normalizeText(col)));
}

export interface CsvImport {
  rows: EarningData[];
  errors: string[];
  /** Colonnes retenues : nom de la colonne du fichier pour chaque champ. */
  columns: CsvMapping;
}

/**
 * Lit un CSV de gains. Colonnes obligatoires : date, produit, montant. `mapping` donne la colonne de chaque champ
 * (choisie par l'utilisateur) ; sans correspondance, les noms courants sont reconnus.
 */
export function parseEarningsCsv(text: string, mapping: CsvMapping = {}): CsvImport {
  const table = readCsv(text);
  if (table.rows.length < 1) return { rows: [], errors: ['Le fichier est vide ou n’a pas de ligne de données.'], columns: {} };
  const useMapping = Object.values(mapping).some(Boolean);
  const wanted = useMapping ? mapping : guessMapping(table.headers);
  const columns: CsvMapping = {};
  const index: Partial<Record<EarningField, number>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as EarningField[]) {
    const col = wanted[field];
    if (!col) continue;
    const i = table.headers.findIndex((h) => normalizeText(h) === normalizeText(col));
    if (i > -1) {
      index[field] = i;
      columns[field] = table.headers[i];
    }
  }
  const missing = (['date', 'product_name', 'amount_cents'] as const).filter((f) => index[f] === undefined);
  if (missing.length) {
    const names = { date: 'date', product_name: 'produit', amount_cents: 'montant' };
    return { rows: [], errors: [`Colonnes introuvables : ${missing.map((f) => names[f]).join(', ')}. Choisis-les dans la liste.`], columns };
  }
  const rows: EarningData[] = [];
  const errors: string[] = [];
  const cell = (cells: string[], field: EarningField) => (index[field] !== undefined ? (cells[index[field]!] ?? '').trim() : '');
  table.rows.forEach((cells, n) => {
    const date = parseDate(cell(cells, 'date'));
    const amount = parseAmount(cell(cells, 'amount_cents'));
    const product = cell(cells, 'product_name');
    if (!date || amount === null || !product) {
      errors.push(`Ligne ${n + 2} ignorée : ${!date ? 'date illisible' : amount === null ? 'montant illisible' : 'produit vide'}.`);
      return;
    }
    const salesRaw = index.sales !== undefined ? Number(cell(cells, 'sales').replace(/\s/g, '')) : NaN;
    const row: EarningData = {
      date,
      product_name: product.slice(0, 200),
      product_id: null,
      video: cell(cells, 'video').slice(0, 300) || null,
      amount_cents: amount,
      sales: Number.isFinite(salesRaw) && cell(cells, 'sales') !== '' ? Math.round(salesRaw) : null,
      source: 'import',
    };
    if (index.format !== undefined) row.format = parseFormat(cell(cells, 'format'));
    if (index.niche !== undefined) row.niche = parseNiche(cell(cells, 'niche'));
    rows.push(row);
  });
  return { rows, errors: errors.slice(0, 20), columns };
}

/** Clé d'une ligne importée : un même relevé importé deux fois n'est pas compté deux fois. */
export const earningKey = (e: Pick<EarningData, 'date' | 'product_name' | 'video' | 'amount_cents'>) =>
  [e.date, normalizeText(e.product_name), normalizeText(e.video ?? ''), e.amount_cents].join('|');

/** Rattache les lignes aux produits suivis reconnus par leur nom (identifiant et niche). */
export function attachProducts(rows: EarningData[], products: Array<{ id: string; name: string; niche: NicheId }>): EarningData[] {
  // Relevé TikTok : titre complet ; saisie à la main : souvent le nom court. Les deux sont reconnus.
  const byName = new Map(products.flatMap((p) => [[normalizeText(displayName(p)), p] as const, [normalizeText(p.name), p] as const]));
  return rows.map((row) => {
    const product = byName.get(normalizeText(row.product_name));
    if (!product) return row;
    return { ...row, product_id: row.product_id ?? product.id, niche: row.niche ?? product.niche };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------------------------------------------------

/** Lundi de la semaine d'une date (AAAA-MM-JJ). */
export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

const monthsBack = (today: string, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const [y, m] = today.slice(0, 7).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1)).toISOString().slice(0, 7);
  });

export interface Bucket {
  key: string;
  label: string;
  cents: number;
}

export interface EarningsDashboard {
  totalCents: number;
  monthCents: number;
  entries: number;
  byProduct: Array<{ name: string; cents: number; sales: number; videos: number }>;
  byVideo: Array<{ video: string; product: string; cents: number }>;
  byWeek: Array<{ start: string; cents: number }>;
  /** 14 derniers jours. */
  byDay: Array<{ date: string; cents: number }>;
  /** 6 derniers mois (AAAA-MM). */
  byMonth: Array<{ month: string; cents: number }>;
  byFormat: Bucket[];
  byNiche: Bucket[];
  bestProduct: { name: string; cents: number } | null;
  bestFormat: { format: ScriptFormat; label: string; cents: number } | null;
  /** Gain moyen par vidéo notée (lignes avec une vidéo) ; null sans vidéo notée. */
  averagePerVideoCents: number | null;
  videos: number;
}

export function earningsDashboard(entries: EarningData[], today = parisDate()): EarningsDashboard {
  const month = today.slice(0, 7);
  const products = new Map<string, { name: string; cents: number; sales: number; videos: Set<string> }>();
  const videos = new Map<string, { video: string; product: string; cents: number }>();
  const weeks = new Map<string, number>();
  const days = new Map<string, number>();
  const months = new Map<string, number>();
  const formats = new Map<string, number>();
  const niches = new Map<string, number>();
  for (const e of entries) {
    const key = normalizeText(e.product_name);
    const p = products.get(key) ?? { name: e.product_name, cents: 0, sales: 0, videos: new Set<string>() };
    p.cents += e.amount_cents;
    p.sales += e.sales ?? 0;
    if (e.video) p.videos.add(normalizeText(e.video));
    products.set(key, p);
    if (e.video) {
      const vKey = `${key}|${normalizeText(e.video)}`;
      const v = videos.get(vKey) ?? { video: e.video, product: e.product_name, cents: 0 };
      v.cents += e.amount_cents;
      videos.set(vKey, v);
    }
    const w = weekStart(e.date);
    weeks.set(w, (weeks.get(w) ?? 0) + e.amount_cents);
    days.set(e.date, (days.get(e.date) ?? 0) + e.amount_cents);
    months.set(e.date.slice(0, 7), (months.get(e.date.slice(0, 7)) ?? 0) + e.amount_cents);
    if (e.format) formats.set(e.format, (formats.get(e.format) ?? 0) + e.amount_cents);
    if (e.niche) niches.set(e.niche, (niches.get(e.niche) ?? 0) + e.amount_cents);
  }
  const lastWeeks = Array.from({ length: 8 }, (_, i) => weekStart(addDays(today, -7 * (7 - i))));
  const byProduct = [...products.values()]
    .map((p) => ({ name: p.name, cents: p.cents, sales: p.sales, videos: p.videos.size }))
    .sort((a, b) => b.cents - a.cents);
  const byFormat = [...formats.entries()]
    .map(([key, cents]) => ({ key, label: formatLabel(key), cents }))
    .sort((a, b) => b.cents - a.cents);
  const byNiche = [...niches.entries()]
    .map(([key, cents]) => ({ key, label: nicheShort(key), cents }))
    .sort((a, b) => b.cents - a.cents);
  const videoCents = [...videos.values()].reduce((s, v) => s + v.cents, 0);
  return {
    totalCents: entries.reduce((s, e) => s + e.amount_cents, 0),
    monthCents: entries.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + e.amount_cents, 0),
    entries: entries.length,
    byProduct,
    byVideo: [...videos.values()].sort((a, b) => b.cents - a.cents).slice(0, 10),
    byWeek: lastWeeks.map((start) => ({ start, cents: weeks.get(start) ?? 0 })),
    byDay: Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).map((date) => ({ date, cents: days.get(date) ?? 0 })),
    byMonth: monthsBack(today, 6).map((m) => ({ month: m, cents: months.get(m) ?? 0 })),
    byFormat,
    byNiche,
    bestProduct: byProduct[0] && byProduct[0].cents > 0 ? { name: byProduct[0].name, cents: byProduct[0].cents } : null,
    bestFormat: byFormat[0] && byFormat[0].cents > 0 ? { format: byFormat[0].key as ScriptFormat, label: byFormat[0].label, cents: byFormat[0].cents } : null,
    averagePerVideoCents: videos.size ? Math.round(videoCents / videos.size) : null,
    videos: videos.size,
  };
}

/** Avancement de l'objectif mensuel (0 à 1, plafonné), null sans objectif. */
export function goalProgress(monthCents: number, goalCents: number | null): { ratio: number; leftCents: number } | null {
  if (!goalCents || goalCents <= 0) return null;
  return { ratio: Math.min(1, Math.max(0, monthCents / goalCents)), leftCents: Math.max(0, goalCents - monthCents) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Export CSV (comptabilité)
// ---------------------------------------------------------------------------------------------------------------------

export const NO_TAX_ADVICE =
  'Export établi à partir de tes saisies et imports, sans vérification. Aucun conseil fiscal : pour tes déclarations, rapproche-toi d’un professionnel ou des services fiscaux.';

const csvCell = (value: string) => (/[;"\r\n]/.test(value) || /^[=+\-@]/.test(value) ? `"${value.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : value);
const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/** CSV pour la comptabilité : séparateur « ; », virgule décimale, BOM pour Excel, mention « aucun conseil fiscal ». */
export function earningsToCsv(entries: EarningData[]): string {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.product_name.localeCompare(b.product_name));
  const lines = [
    ['Date', 'Produit', 'Vidéo', 'Format', 'Niche', 'Ventes', 'Montant (EUR)', 'Origine'].join(';'),
    ...sorted.map((e) =>
      [
        e.date,
        csvCell(e.product_name),
        csvCell(e.video ?? ''),
        e.format ? csvCell(formatLabel(e.format)) : '',
        e.niche ? csvCell(nicheShort(e.niche)) : '',
        e.sales === null ? '' : String(e.sales),
        euros(e.amount_cents),
        e.source === 'import' ? 'import' : 'saisie',
      ].join(';'),
    ),
    ['Total', '', '', '', '', '', euros(entries.reduce((s, e) => s + e.amount_cents, 0)), ''].join(';'),
    '',
    csvCell(NO_TAX_ADVICE),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}
