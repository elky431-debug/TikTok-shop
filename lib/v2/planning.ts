import { BRAND, BRAND_SLUG } from '@/lib/brand';
import { addDays } from '@/lib/utils';

/**
 * Plan de publication : 20 vidéos par produit suivi (au-delà de 20 vidéos, chaque vidéo rapporte en moyenne bien plus),
 * réparties selon le rythme choisi. Rien n'est publié à la place de l'utilisateur : des rappels et un calendrier.
 */
export const PLAN_VIDEOS = 20;
export const RHYTHMS = [3, 5, 7] as const;
export type Rhythm = (typeof RHYTHMS)[number];
export type PlanItemStatus = 'a_tourner' | 'tourne' | 'poste';

export interface PlanItem {
  n: number;
  /** AAAA-MM-JJ */
  date: string;
  status: PlanItemStatus;
  url: string | null;
}

export interface PublicationPlan {
  product_id: string;
  product_name: string;
  rhythm: Rhythm;
  start: string;
  items: PlanItem[];
}

/** Jours de la semaine utilisés selon le rythme (0 = lundi) : réguliers, sans regrouper les vidéos. */
const WEEK_SLOTS: Record<Rhythm, number[]> = { 3: [0, 2, 4], 5: [0, 1, 2, 3, 4], 7: [0, 1, 2, 3, 4, 5, 6] };

export function buildPlan(input: { productId: string; productName: string; rhythm: Rhythm; start: string }): PublicationPlan {
  const items: PlanItem[] = [];
  for (let offset = 0; items.length < PLAN_VIDEOS; offset++) {
    const date = addDays(input.start, offset);
    const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    if (WEEK_SLOTS[input.rhythm].includes(weekday)) items.push({ n: items.length + 1, date, status: 'a_tourner', url: null });
  }
  return { product_id: input.productId, product_name: input.productName, rhythm: input.rhythm, start: input.start, items };
}

export function planProgress(plan: PublicationPlan) {
  return {
    posted: plan.items.filter((i) => i.status === 'poste').length,
    filmed: plan.items.filter((i) => i.status === 'tourne').length,
    total: plan.items.length,
  };
}

/** Vidéos prévues ce jour-là et pas encore postées. */
export function dueOn(plan: PublicationPlan, day: string): PlanItem[] {
  return plan.items.filter((i) => i.date === day && i.status !== 'poste');
}

/** Texte iCalendar : échappement des virgules, points-virgules, antislashs et retours à la ligne (RFC 5545, 3.3.11). */
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lignes de 75 octets au plus, suite précédée d'une espace (RFC 5545, 3.1). */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Ne pas couper au milieu d'un caractère UTF-8.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return parts.join('\r\n ');
}

/** Calendrier .ics du plan (une journée entière par vidéo), à importer dans Google Agenda, Apple Calendrier… */
export function planToIcs(plan: PublicationPlan, planId: string, siteUrl: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${BRAND}//Plan de publication//FR`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(`${BRAND} · ${plan.product_name}`)}`,
  ];
  for (const item of plan.items) {
    const day = item.date.replace(/-/g, '');
    const next = addDays(item.date, 1).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${planId}-${item.n}@${BRAND_SLUG}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${icsText(`Vidéo ${item.n}/${plan.items.length} : ${plan.product_name}`)}`,
      `DESCRIPTION:${icsText(`Tourne et poste ta vidéo n°${item.n}. Scripts : ${siteUrl}/app/studio?produit=${plan.product_id}`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
