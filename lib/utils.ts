/** Concatène des classes CSS en ignorant les valeurs vides. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const euroFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const euroRoundFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const intFormatter = new Intl.NumberFormat('fr-FR');

/** 1990 → « 19,90 € ». */
export function formatEuros(cents: number, opts: { round?: boolean } = {}): string {
  const value = cents / 100;
  if (opts.round || Number.isInteger(value)) return euroRoundFormatter.format(value).replace(/ /g, ' ');
  return euroFormatter.format(value).replace(/ /g, ' ');
}

/** 12345 → « 12 345 ». */
export function formatInt(value: number): string {
  return intFormatter.format(Math.round(value)).replace(/ /g, ' ');
}

/** 1200 → « 1,2 k », 2_300_000 → « 2,3 M ». */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (value >= 10_000) return `${Math.round(value / 1000)} k`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1).replace('.', ',')} k`;
  return formatInt(value);
}

/** 0.184 → « 18 % ». */
export function formatPercent(ratio: number, digits = 0): string {
  const value = (ratio * 100).toFixed(digits).replace('.', ',');
  return `${value} %`;
}

/** Variation signée : 0.42 → « +42 % », -0.1 → « −10 % ». */
export function formatGrowth(ratio: number): string {
  const pct = Math.round(ratio * 100);
  if (pct > 0) return `+${pct} %`;
  if (pct < 0) return `−${Math.abs(pct)} %`;
  return '0 %';
}

const PARIS = 'Europe/Paris';

/** Date du jour à Paris au format AAAA-MM-JJ. */
export function parisDate(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return parts; // en-CA donne déjà AAAA-MM-JJ
}

/** Heure (0-23) actuelle à Paris. */
export function parisHour(at: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', hour12: false }).format(at);
  return Number.parseInt(hour, 10) % 24;
}

/** Décale une date AAAA-MM-JJ de n jours. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Liste des n dates se terminant par `end` (incluse), de la plus ancienne à la plus récente. */
export function dateRange(end: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(end, i - days + 1));
}

/** Nombre de jours entre deux dates AAAA-MM-JJ. */
export function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** « 12 nov. » */
export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** « mardi 12 novembre » (l'année est ajoutée si ce n'est pas l'année en cours). */
export function formatLongDate(date: string, now: Date = new Date()): string {
  const d = new Date(`${date}T12:00:00Z`);
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(d);
}

/** « il y a 3 jours », « aujourd'hui » à partir d'un horodatage ISO. */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'jamais';
  const diff = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 2) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} jours`;
  const months = Math.round(days / 30);
  return `il y a ${months} mois`;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

/** Code aléatoire lisible (sans 0/O/1/I). */
export function randomCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function randomId(): string {
  return globalThis.crypto.randomUUID();
}

/** Pluriel simple : plural(3, 'vidéo') → « 3 vidéos ». */
export function plural(count: number, singular: string, pluralForm?: string): string {
  const word = Math.abs(count) >= 2 ? pluralForm ?? `${singular}s` : singular;
  return `${formatInt(count)} ${word}`;
}

/** Guillemets français avec espaces insécables : « texte ». */
export function quote(text: string): string {
  return `« ${text} »`;
}
