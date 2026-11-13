import type { Repo } from '@/lib/db';
import type { Product, Profile, UserRecord } from '@/lib/db/types';
import type { NotificationData } from '@/lib/notify';
import { getPlan } from '@/lib/plans';
import { addDays, formatEuros, formatInt, parisDate } from '@/lib/utils';
import { getWeeklyGoal, listBoards } from '@/lib/v2/board';
import { isDeclining } from '@/lib/v2/decline';
import { EARNINGS_KIND, type EarningData } from '@/lib/v2/earnings';
import { getEarningsGoal } from '@/lib/v2/earnings-store';
import { postedDates, postingStreak, type PlanItem, type PublicationPlan } from '@/lib/v2/planning';
import { getCreatorProfile, type CreatorProfile } from '@/lib/creator-profile';
import { listHistory } from '@/lib/studio/store';

/**
 * Données du dashboard (`/app`) : uniquement des chiffres saisis par l'utilisateur ou mesurés (vidéos cochées,
 * alertes reçues, relevés des produits). Rien n'est estimé ; un chiffre absent reste absent.
 */

export type Direction = 'up' | 'down' | 'flat';

export interface Variation {
  direction: Direction;
  /** « +12 % », « −3 », « = » */
  label: string;
  /** « vs le mois dernier à la même date » */
  compare: string;
}

/**
 * Variation entre deux périodes. En pourcentage quand la période précédente n'est pas nulle, sinon en valeur absolue
 * (un pourcentage depuis zéro ne veut rien dire).
 */
export function variation(current: number, previous: number, compare: string, format: (n: number) => string = formatInt): Variation {
  const diff = current - previous;
  if (diff === 0) return { direction: 'flat', label: '=', compare };
  const direction: Direction = diff > 0 ? 'up' : 'down';
  const sign = diff > 0 ? '+' : '−';
  if (previous > 0) {
    const pct = Math.round((Math.abs(diff) / previous) * 100);
    return { direction, label: `${sign}${formatInt(pct)} %`, compare };
  }
  return { direction, label: `${sign}${format(Math.abs(diff))}`, compare };
}

/** Du 1er du mois à aujourd'hui, et la même durée au début du mois précédent (bornée à sa fin). */
export function monthSpans(today: string): { current: [string, string]; previous: [string, string] } {
  const first = `${today.slice(0, 8)}01`;
  const day = Number(today.slice(8, 10));
  const prevFirst = (() => {
    const [y, m] = today.split('-').map(Number);
    return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  })();
  const prevLast = addDays(first, -1);
  const prevEnd = addDays(prevFirst, day - 1);
  return { current: [first, today], previous: [prevFirst, prevEnd < prevLast ? prevEnd : prevLast] };
}

/** Lundi de la semaine qui contient `day` (AAAA-MM-JJ). */
export function mondayOf(day: string): string {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

const within = (date: string, [from, to]: [string, string]) => date >= from && date <= to;

export interface DayPoint {
  date: string;
  gains_cents: number;
  sales: number;
}

/** Gains et ventes saisis, jour par jour, sur les `days` derniers jours (aujourd'hui compris). */
export function dailySeries(entries: EarningData[], today: string, days = 90): DayPoint[] {
  const byDay = new Map<string, DayPoint>();
  const start = addDays(today, -(days - 1));
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    byDay.set(date, { date, gains_cents: 0, sales: 0 });
  }
  for (const e of entries) {
    const point = byDay.get(e.date);
    if (!point) continue;
    point.gains_cents += e.amount_cents;
    point.sales += e.sales ?? 0;
  }
  return [...byDay.values()];
}

export interface Kpi {
  key: 'gains' | 'ventes' | 'videos' | 'suivis' | 'alertes';
  label: string;
  /** null = pas disponible dans le plan (« Pro ») ou pas encore de donnée. */
  value: number | null;
  /** Texte affiché (montant en euros, « 3 / 5 »…). */
  display: string;
  /** Pour l'animation de comptage : valeur numérique et format. */
  format: 'euros' | 'int' | 'ratio';
  goal?: number;
  variation: Variation | null;
  locked?: boolean;
}

export interface UpcomingVideo {
  productId: string;
  productName: string;
  n: number;
  date: string | null;
  overdue: boolean;
}

export interface ActivityItem {
  at: string;
  kind: 'script' | 'gain' | 'video' | 'alerte' | 'suivi';
  text: string;
  href: string;
}

export interface FollowedProduct {
  product: Product;
  declining: boolean;
}

/** Les 3 prochaines vidéos à tourner : en retard d'abord, puis par date ; sans date ensuite (ordre du tableau). */
export function nextVideos(boards: PublicationPlan[], today: string, limit = 3): UpcomingVideo[] {
  const sunday = addDays(mondayOf(today), 6);
  const items: UpcomingVideo[] = [];
  for (const plan of boards) {
    const pending = plan.items.filter((i: PlanItem) => i.status !== 'poste');
    for (const item of pending) {
      if (item.date && item.date > sunday) continue;
      items.push({ productId: plan.product_id, productName: plan.product_name, n: item.n, date: item.date, overdue: Boolean(item.date && item.date < today) });
    }
  }
  const dated = items.filter((i) => i.date).sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : a.n - b.n));
  // Sans calendrier : une vidéo par produit (la prochaine du tableau), pour ne pas aligner 3 fois le même produit.
  const seen = new Set<string>();
  const undated = items.filter((i) => !i.date && !seen.has(i.productId) && seen.add(i.productId));
  return [...dated, ...undated].slice(0, limit);
}

export interface DashboardData {
  today: string;
  streak: number;
  kpis: Kpi[];
  series: DayPoint[];
  hasEarnings: boolean;
  earningsEnabled: boolean;
  monthGains: number;
  goalCents: number | null;
  upcoming: UpcomingVideo[];
  hasBoards: boolean;
  planningEnabled: boolean;
  followed: FollowedProduct[];
  activity: ActivityItem[];
  creator: CreatorProfile | null;
}

export async function loadDashboard(repo: Repo, profile: Profile, now = new Date()): Promise<DashboardData> {
  const today = parisDate(now);
  const plan = getPlan(profile.plan);
  const [gainRecords, boardsMap, weekly, goal, saved, notifications, scripts, creator] = await Promise.all([
    plan.earnings ? repo.listRecords<EarningData>(profile.id, EARNINGS_KIND) : Promise.resolve([] as Array<UserRecord<EarningData>>),
    listBoards(repo, profile.id),
    getWeeklyGoal(repo, profile.id),
    getEarningsGoal(repo, profile.id),
    repo.listSavedProducts(profile.id),
    repo.listRecords<NotificationData>(profile.id, 'notification'),
    listHistory(profile.id, repo),
    getCreatorProfile(repo, profile.id),
  ]);
  const gains = gainRecords.map((r) => r.data);
  const boards = [...boardsMap.values()].map((b) => b.data);

  // Gains et ventes du mois, face au mois dernier à la même date.
  const spans = monthSpans(today);
  const sumCents = (span: [string, string]) => gains.filter((g) => within(g.date, span)).reduce((s, g) => s + g.amount_cents, 0);
  const sumSales = (span: [string, string]) => gains.filter((g) => within(g.date, span)).reduce((s, g) => s + (g.sales ?? 0), 0);
  const monthGains = sumCents(spans.current);
  const monthSales = sumSales(spans.current);
  const vsMonth = 'vs le mois dernier à la même date';

  // Vidéos cochées « postée » : semaine en cours face à la précédente.
  const dates = postedDates(boards);
  const monday = mondayOf(today);
  const thisWeek = dates.filter((d) => within(d, [monday, addDays(monday, 6)])).length;
  const lastWeek = dates.filter((d) => within(d, [addDays(monday, -7), addDays(monday, -1)])).length;

  // Produits suivis : ajoutés ces 7 derniers jours.
  const weekAgo = addDays(today, -6);
  const addedThisWeek = saved.filter((s) => parisDate(new Date(s.created_at)) >= weekAgo).length;

  // Alertes reçues (radar et baisses) aujourd'hui, face à hier.
  const alertDays = notifications
    .filter((n) => n.data.type === 'alerte' || n.data.type === 'baisse')
    .map((n) => parisDate(new Date(n.created_at)));
  const alertsToday = alertDays.filter((d) => d === today).length;
  const alertsYesterday = alertDays.filter((d) => d === addDays(today, -1)).length;

  const kpis: Kpi[] = [
    {
      key: 'gains',
      label: 'Gains du mois',
      value: plan.earnings ? monthGains : null,
      display: plan.earnings ? formatEuros(monthGains) : '—',
      format: 'euros',
      variation: plan.earnings ? variation(monthGains, sumCents(spans.previous), vsMonth, (c) => formatEuros(c, { round: true })) : null,
      locked: !plan.earnings,
    },
    {
      key: 'ventes',
      label: 'Ventes du mois',
      value: plan.earnings ? monthSales : null,
      display: plan.earnings ? formatInt(monthSales) : '—',
      format: 'int',
      variation: plan.earnings ? variation(monthSales, sumSales(spans.previous), vsMonth) : null,
      locked: !plan.earnings,
    },
    {
      key: 'videos',
      label: `Vidéos postées cette semaine (objectif ${weekly.weekly})`,
      value: thisWeek,
      display: `${formatInt(thisWeek)} / ${formatInt(weekly.weekly)}`,
      format: 'ratio',
      goal: weekly.weekly,
      variation: variation(thisWeek, lastWeek, 'vs la semaine dernière'),
    },
    {
      key: 'suivis',
      label: 'Produits suivis',
      value: saved.length,
      display: formatInt(saved.length),
      format: 'int',
      variation: addedThisWeek ? { direction: 'up', label: `+${formatInt(addedThisWeek)}`, compare: 'ajoutés ces 7 derniers jours' } : null,
    },
    {
      key: 'alertes',
      label: 'Alertes déclenchées aujourd’hui',
      value: alertsToday,
      display: formatInt(alertsToday),
      format: 'int',
      variation: variation(alertsToday, alertsYesterday, 'vs hier'),
    },
  ];

  const products = saved.length ? await repo.getProducts(saved.map((s) => s.product_id)) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const followed: FollowedProduct[] = saved
    .map((s) => byId.get(s.product_id))
    .filter((p): p is Product => Boolean(p))
    .map((product) => ({ product, declining: isDeclining(product) }))
    .sort((a, b) => Number(b.declining) - Number(a.declining) || b.product.latest_score - a.product.latest_score);

  // Activité récente : scripts écrits, gains saisis, vidéos postées, alertes reçues.
  const activity: ActivityItem[] = [
    ...scripts.slice(0, 5).map((s) => ({
      at: s.generated_at,
      kind: 'script' as const,
      text: `Scripts écrits pour ${s.product_name}`,
      href: `/app/studio/${encodeURIComponent(s.id)}`,
    })),
    ...gainRecords.slice(0, 5).map((g) => ({
      at: g.created_at,
      kind: 'gain' as const,
      text: `Gain saisi : ${formatEuros(g.data.amount_cents)} sur ${g.data.product_name}`,
      href: '/app/gains',
    })),
    ...boards.flatMap((b) =>
      b.items
        .filter((i) => i.status === 'poste' && i.posted_at)
        .map((i) => ({ at: `${i.posted_at}T12:00:00.000Z`, kind: 'video' as const, text: `Vidéo n°${i.n} postée sur ${b.product_name}`, href: `/app/mes-produits/${encodeURIComponent(b.product_id)}` })),
    ),
    ...notifications
      .filter((n) => n.data.type === 'alerte' || n.data.type === 'baisse')
      .slice(0, 5)
      .map((n) => ({ at: n.created_at, kind: 'alerte' as const, text: n.data.title, href: n.data.path || '/app/notifications' })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 6);

  return {
    today,
    streak: postingStreak(dates, today),
    kpis,
    series: dailySeries(gains, today, 90),
    hasEarnings: gains.length > 0,
    earningsEnabled: plan.earnings,
    monthGains,
    goalCents: goal.cents,
    upcoming: nextVideos(boards, today),
    hasBoards: boards.some((b) => b.items.some((i) => i.status !== 'poste')),
    planningEnabled: plan.planning,
    followed: followed.slice(0, 5),
    activity,
    creator,
  };
}
