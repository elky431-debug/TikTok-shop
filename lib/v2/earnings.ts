import { addDays, parisDate } from '@/lib/utils';

/**
 * Suivi des gains : saisie à la main ou import CSV (relevé exporté de TikTok Shop, tableur…). Aucune connexion au
 * compte TikTok : l'utilisateur apporte ses propres chiffres. Aucun calcul fiscal.
 */
export interface EarningData {
  /** AAAA-MM-JJ */
  date: string;
  product_name: string;
  product_id: string | null;
  /** Repère libre de la vidéo (titre, lien, numéro). */
  video: string | null;
  amount_cents: number;
  sales: number | null;
  source: 'saisie' | 'import';
}

const HEADER_ALIASES: Record<keyof Pick<EarningData, 'date' | 'product_name' | 'video' | 'amount_cents' | 'sales'>, string[]> = {
  date: ['date', 'jour', 'day'],
  product_name: ['produit', 'product', 'nom du produit', 'product name', 'article'],
  video: ['video', 'vidéo', 'lien', 'video link', 'contenu'],
  amount_cents: ['montant', 'gain', 'gains', 'commission', 'commissions', 'amount', 'earnings', 'revenu'],
  sales: ['ventes', 'commandes', 'sales', 'orders', 'quantité'],
};

const normalize = (s: string) =>
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
  const cleaned = raw.replace(/[€\s  ]/g, '').replace(/EUR/i, '');
  if (!cleaned) return null;
  const normalized = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/** « 12/11/2026 », « 2026-11-12 », « 12-11-2026 » → AAAA-MM-JJ. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export interface CsvImport {
  rows: EarningData[];
  errors: string[];
  /** Colonnes reconnues : nom de la colonne du fichier pour chaque champ. */
  columns: Partial<Record<keyof typeof HEADER_ALIASES, string>>;
}

/**
 * Lit un CSV de gains. Séparateur détecté (; , ou tabulation). Colonnes obligatoires : date, produit, montant.
 * `mapping` force la colonne de chaque champ (choisie par l'utilisateur), sinon les noms courants sont reconnus.
 */
export function parseEarningsCsv(text: string, mapping: Partial<Record<keyof typeof HEADER_ALIASES, string>> = {}): CsvImport {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ['Le fichier est vide ou n’a pas de ligne de données.'], columns: {} };
  const sep = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const headers = splitLine(lines[0], sep);
  const columns: CsvImport['columns'] = {};
  const index: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>) {
    const wanted = mapping[field];
    const i = wanted
      ? headers.findIndex((h) => normalize(h) === normalize(wanted))
      : headers.findIndex((h) => HEADER_ALIASES[field].includes(normalize(h)));
    if (i > -1) {
      index[field] = i;
      columns[field] = headers[i];
    }
  }
  const missing = (['date', 'product_name', 'amount_cents'] as const).filter((f) => index[f] === undefined);
  if (missing.length) {
    const names = { date: 'date', product_name: 'produit', amount_cents: 'montant' };
    return { rows: [], errors: [`Colonnes introuvables : ${missing.map((f) => names[f]).join(', ')}. Choisis-les dans la liste.`], columns };
  }
  const rows: EarningData[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, n) => {
    const cells = splitLine(line, sep);
    const date = parseDate(cells[index.date!] ?? '');
    const amount = parseAmount(cells[index.amount_cents!] ?? '');
    const product = (cells[index.product_name!] ?? '').trim();
    if (!date || amount === null || !product) {
      errors.push(`Ligne ${n + 2} ignorée : ${!date ? 'date illisible' : amount === null ? 'montant illisible' : 'produit vide'}.`);
      return;
    }
    const salesRaw = index.sales !== undefined ? Number((cells[index.sales] ?? '').replace(/\s/g, '')) : NaN;
    rows.push({
      date,
      product_name: product.slice(0, 200),
      product_id: null,
      video: index.video !== undefined ? (cells[index.video] ?? '').trim().slice(0, 300) || null : null,
      amount_cents: amount,
      sales: Number.isFinite(salesRaw) ? Math.round(salesRaw) : null,
      source: 'import',
    });
  });
  return { rows, errors: errors.slice(0, 20), columns };
}

/** Lundi de la semaine d'une date (AAAA-MM-JJ). */
export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export interface EarningsDashboard {
  totalCents: number;
  monthCents: number;
  entries: number;
  byProduct: Array<{ name: string; cents: number; sales: number; videos: number }>;
  byVideo: Array<{ video: string; product: string; cents: number }>;
  byWeek: Array<{ start: string; cents: number }>;
  bestProduct: { name: string; cents: number } | null;
}

export function earningsDashboard(entries: EarningData[], today = parisDate()): EarningsDashboard {
  const month = today.slice(0, 7);
  const products = new Map<string, { name: string; cents: number; sales: number; videos: Set<string> }>();
  const videos = new Map<string, { video: string; product: string; cents: number }>();
  const weeks = new Map<string, number>();
  for (const e of entries) {
    const key = e.product_name.toLowerCase();
    const p = products.get(key) ?? { name: e.product_name, cents: 0, sales: 0, videos: new Set<string>() };
    p.cents += e.amount_cents;
    p.sales += e.sales ?? 0;
    if (e.video) p.videos.add(e.video);
    products.set(key, p);
    if (e.video) {
      const v = videos.get(`${key}|${e.video}`) ?? { video: e.video, product: e.product_name, cents: 0 };
      v.cents += e.amount_cents;
      videos.set(`${key}|${e.video}`, v);
    }
    const w = weekStart(e.date);
    weeks.set(w, (weeks.get(w) ?? 0) + e.amount_cents);
  }
  const lastWeeks = Array.from({ length: 8 }, (_, i) => weekStart(addDays(today, -7 * (7 - i))));
  const byProduct = [...products.values()]
    .map((p) => ({ name: p.name, cents: p.cents, sales: p.sales, videos: p.videos.size }))
    .sort((a, b) => b.cents - a.cents);
  return {
    totalCents: entries.reduce((s, e) => s + e.amount_cents, 0),
    monthCents: entries.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + e.amount_cents, 0),
    entries: entries.length,
    byProduct,
    byVideo: [...videos.values()].sort((a, b) => b.cents - a.cents).slice(0, 10),
    byWeek: lastWeeks.map((start) => ({ start, cents: weeks.get(start) ?? 0 })),
    bestProduct: byProduct[0] && byProduct[0].cents > 0 ? { name: byProduct[0].name, cents: byProduct[0].cents } : null,
  };
}
