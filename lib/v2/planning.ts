import { BRAND, BRAND_SLUG } from '@/lib/brand';
import { addDays } from '@/lib/utils';

/**
 * Tableau des vidéos d'un produit suivi et plan de publication (fiche `publication`, une par produit suivi).
 *
 * Chaque produit suivi a ses vidéos (20 par défaut : au-delà de 20 vidéos sur un même produit, chaque vidéo rapporte en
 * moyenne bien plus), rangées en trois colonnes : à tourner, tourné, posté. Le tableau existe pour tous les plans ; le
 * calendrier (dates réparties selon un rythme, rappels, export .ics) est réservé aux plans qui ont `planning`.
 * Rien n'est publié à la place de l'utilisateur : des rappels et un calendrier, c'est tout.
 */
export const PLAN_VIDEOS = 20;
export const MAX_BOARD_VIDEOS = 200;
export const RHYTHMS = [3, 5, 7] as const;
export type Rhythm = (typeof RHYTHMS)[number];
export const PLAN_STATUSES = ['a_tourner', 'tourne', 'poste'] as const;
export type PlanItemStatus = (typeof PLAN_STATUSES)[number];

export const STATUS_LABELS: Record<PlanItemStatus, string> = { a_tourner: 'À tourner', tourne: 'Tourné', poste: 'Posté' };

export interface PlanItem {
  n: number;
  /** Date prévue (AAAA-MM-JJ) ; null = pas encore dans le calendrier. */
  date: string | null;
  status: PlanItemStatus;
  /** Lien de la vidéo postée (saisi à la main). */
  url: string | null;
  /** Date réelle de publication (AAAA-MM-JJ), mise au jour du passage en « posté », modifiable. */
  posted_at?: string | null;
  /** Vues et ventes saisies à la main (null = pas renseigné). */
  views?: number | null;
  sales?: number | null;
}

export interface PublicationPlan {
  product_id: string;
  product_name: string;
  /** Rythme du calendrier ; null = tableau sans calendrier. */
  rhythm: Rhythm | null;
  /** Premier jour du calendrier ; null = tableau sans calendrier. */
  start: string | null;
  items: PlanItem[];
}

export const isPlanStatus = (value: unknown): value is PlanItemStatus => PLAN_STATUSES.includes(value as PlanItemStatus);
export const isRhythm = (value: unknown): value is Rhythm => RHYTHMS.includes(value as Rhythm);

/** Jours de la semaine utilisés selon le rythme (0 = lundi) : réguliers, sans regrouper les vidéos. */
const WEEK_SLOTS: Record<Rhythm, number[]> = { 3: [0, 2, 4], 5: [0, 1, 2, 3, 4], 7: [0, 1, 2, 3, 4, 5, 6] };

/** Jour de la semaine, 0 = lundi. */
export const weekdayOf = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;

/** Les `count` prochains jours de publication à partir de `start` (inclus), selon le rythme. */
export function slotDates(rhythm: Rhythm, start: string, count: number): string[] {
  const dates: string[] = [];
  for (let offset = 0; dates.length < count && offset < count * 7 + 7; offset++) {
    const date = addDays(start, offset);
    if (WEEK_SLOTS[rhythm].includes(weekdayOf(date))) dates.push(date);
  }
  return dates;
}

/** Tableau neuf : `goal` vidéos, les `alreadyPosted` premières déjà postées (compteur d'avant le tableau). */
export function newBoard(input: { productId: string; productName: string; goal?: number; alreadyPosted?: number }): PublicationPlan {
  const goal = clampGoal(input.goal ?? PLAN_VIDEOS);
  const posted = Math.max(0, Math.min(goal, Math.round(input.alreadyPosted ?? 0)));
  return {
    product_id: input.productId,
    product_name: input.productName,
    rhythm: null,
    start: null,
    items: Array.from({ length: goal }, (_, i) => ({ n: i + 1, date: null, status: i < posted ? 'poste' : 'a_tourner', url: null })),
  };
}

const clampGoal = (goal: number) => Math.max(1, Math.min(MAX_BOARD_VIDEOS, Math.round(goal) || PLAN_VIDEOS));

/**
 * Répartit les vidéos pas encore postées sur les semaines à venir, selon le rythme, à partir de `start`.
 * Les vidéos postées gardent leur date.
 */
export function schedulePlan(plan: PublicationPlan, rhythm: Rhythm, start: string): PublicationPlan {
  const open = plan.items.filter((i) => i.status !== 'poste');
  const dates = slotDates(rhythm, start, open.length);
  let k = 0;
  return {
    ...plan,
    rhythm,
    start,
    items: plan.items.map((item) => (item.status === 'poste' ? item : { ...item, date: dates[k++] ?? null })),
  };
}

/** Retire le calendrier (le tableau et les vidéos postées restent). */
export function unschedulePlan(plan: PublicationPlan): PublicationPlan {
  return { ...plan, rhythm: null, start: null, items: plan.items.map((i) => (i.status === 'poste' ? i : { ...i, date: null })) };
}

/** Plan de 20 vidéos réparties selon le rythme, à partir de `start`. */
export function buildPlan(input: { productId: string; productName: string; rhythm: Rhythm; start: string }): PublicationPlan {
  return schedulePlan(newBoard({ productId: input.productId, productName: input.productName }), input.rhythm, input.start);
}

/**
 * Change le nombre de vidéos visé : ajoute des vidéos « à tourner » ou retire les dernières vidéos encore à tourner
 * (jamais une vidéo tournée ou postée). Si un calendrier existe, les nouvelles vidéos y sont placées à la suite.
 */
export function resizeBoard(plan: PublicationPlan, goal: number, today: string): PublicationPlan {
  const target = clampGoal(goal);
  let items = [...plan.items];
  while (items.length > target) {
    const last = items.findLastIndex((i) => i.status === 'a_tourner');
    if (last === -1) break;
    items.splice(last, 1);
  }
  items = items.map((item, i) => ({ ...item, n: i + 1 }));
  const added: PlanItem[] = [];
  for (let n = items.length + 1; n <= target; n++) added.push({ n, date: null, status: 'a_tourner', url: null });
  if (added.length && plan.rhythm) {
    const lastDate = items.reduce<string | null>((max, i) => (i.date && (!max || i.date > max) ? i.date : max), null);
    const from = [lastDate ? addDays(lastDate, 1) : null, plan.start, addDays(today, 1)].filter((d): d is string => Boolean(d)).sort().at(-1)!;
    const dates = slotDates(plan.rhythm, from, added.length);
    added.forEach((item, i) => (item.date = dates[i] ?? null));
  }
  return { ...plan, items: [...items, ...added] };
}

/** Déplace une vidéo dans une colonne. En « posté », la date de publication est celle du jour si elle manque. */
export function moveItem(plan: PublicationPlan, n: number, status: PlanItemStatus, today: string): PublicationPlan {
  return {
    ...plan,
    items: plan.items.map((item) =>
      item.n !== n ? item : { ...item, status, posted_at: status === 'poste' ? (item.posted_at ?? today) : (item.posted_at ?? null) },
    ),
  };
}

export interface PostedDetails {
  url: string | null;
  posted_at: string | null;
  views: number | null;
  sales: number | null;
}

/** Lien, date, vues et ventes d'une vidéo postée (saisis à la main). */
export function setPostedDetails(plan: PublicationPlan, n: number, details: PostedDetails): PublicationPlan {
  return { ...plan, items: plan.items.map((item) => (item.n === n ? { ...item, ...details } : item)) };
}

export function planProgress(plan: PublicationPlan) {
  return {
    posted: plan.items.filter((i) => i.status === 'poste').length,
    filmed: plan.items.filter((i) => i.status === 'tourne').length,
    todo: plan.items.filter((i) => i.status === 'a_tourner').length,
    total: plan.items.length,
  };
}

/** Vidéos prévues ce jour-là et pas encore postées. */
export function dueOn(plan: PublicationPlan, day: string): PlanItem[] {
  return plan.items.filter((i) => i.date === day && i.status !== 'poste');
}

/** Lien sûr (http ou https seulement) : sinon null. */
export function safeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Calendrier mensuel
// ---------------------------------------------------------------------------------------------------------------------

export interface CalendarEntry {
  planId: string;
  productId: string;
  product: string;
  n: number;
  total: number;
  status: PlanItemStatus;
}

export interface CalendarDay {
  date: string;
  inMonth: boolean;
  entries: CalendarEntry[];
}

/** « 2026-11 » valide, sinon null. */
export function parseMonth(value: string | undefined | null): string | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Semaines (lundi → dimanche) qui couvrent le mois, avec les vidéos prévues ou postées chaque jour. */
export function monthCalendar(month: string, plans: Array<{ id: string; data: PublicationPlan }>): CalendarDay[][] {
  const first = `${month}-01`;
  const start = addDays(first, -weekdayOf(first));
  const byDate = new Map<string, CalendarEntry[]>();
  for (const { id, data } of plans) {
    for (const item of data.items) {
      const day = item.status === 'poste' ? (item.posted_at ?? item.date) : item.date;
      if (!day) continue;
      const list = byDate.get(day) ?? [];
      list.push({ planId: id, productId: data.product_id, product: data.product_name, n: item.n, total: data.items.length, status: item.status });
      byDate.set(day, list);
    }
  }
  const weeks: CalendarDay[][] = [];
  for (let cursor = start; cursor.slice(0, 7) <= month || weeks.length === 0; ) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: cursor, inMonth: cursor.startsWith(month), entries: byDate.get(cursor) ?? [] });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    if (!cursor.startsWith(month)) break;
  }
  return weeks;
}

// ---------------------------------------------------------------------------------------------------------------------
// Série et objectif hebdomadaire
// ---------------------------------------------------------------------------------------------------------------------

export const DEFAULT_WEEKLY_GOAL = 5;
export const MAX_WEEKLY_GOAL = 50;

/** Réglage de l'utilisateur (fiche `objectif_videos`). */
export interface VideoGoalSettings {
  weekly: number;
}

/** Dates de publication réelles (une par vidéo postée). */
export function postedDates(plans: PublicationPlan[]): string[] {
  return plans.flatMap((p) => p.items.filter((i) => i.status === 'poste' && i.posted_at).map((i) => i.posted_at as string));
}

/**
 * Série : jours consécutifs avec au moins une vidéo postée, jusqu'à aujourd'hui. Une journée en cours sans vidéo ne
 * casse pas la série tant qu'elle n'est pas finie (on compte alors à partir d'hier).
 */
export function postingStreak(dates: string[], today: string): number {
  const days = new Set(dates);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Vidéos postées pendant la semaine en cours (lundi → dimanche). */
export function postedThisWeek(dates: string[], today: string): number {
  const monday = addDays(today, -weekdayOf(today));
  const sunday = addDays(monday, 6);
  return dates.filter((d) => d >= monday && d <= sunday).length;
}

export function clampWeeklyGoal(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(MAX_WEEKLY_GOAL, Math.round(value))) : DEFAULT_WEEKLY_GOAL;
}

// ---------------------------------------------------------------------------------------------------------------------
// Export .ics
// ---------------------------------------------------------------------------------------------------------------------

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

/** Calendrier .ics du plan (une journée entière par vidéo datée), à importer dans Google Agenda, Apple Calendrier… */
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
    if (!item.date) continue;
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
