import { getRepo, type Repo } from '@/lib/db';
import type { DigestContent, Profile } from '@/lib/db/types';
import type { NotificationData } from '@/lib/notify';
import { getPlan } from '@/lib/plans';
import { addDays, formatDayMonth, parisTimeToUtc } from '@/lib/utils';
import type { PublicationPlan } from '@/lib/v2/planning';

/**
 * Partie personnelle du récap du matin : alertes déclenchées et produits suivis en baisse (notifications `alerte` et
 * `baisse` créées depuis la veille, produites par d'autres modules : on les lit seulement), et le défi du jour.
 */
export interface DigestNotice {
  title: string;
  body: string;
  path: string;
}

export interface DigestChallenge {
  /** « Poste ta vidéo n°7 sur Sérum éclat » */
  text: string;
  /** Précision (« prévue aujourd'hui », « 3 sur 20 »…). */
  detail: string;
  path: string;
  product_id: string | null;
  kind: 'plan' | 'retard' | 'objectif' | 'premiere';
}

export interface DigestPersonal {
  alerts: DigestNotice[];
  drops: DigestNotice[];
  /** Nombre total (les listes sont coupées à 5). */
  alerts_total: number;
  drops_total: number;
  challenge: DigestChallenge | null;
}

/** Contenu du récap tel qu'il est enregistré : le contenu commun, plus la partie personnelle. */
export type PersonalDigestContent = DigestContent & { personal?: DigestPersonal };

const MAX_NOTICES = 5;

/** Notifications d'un type créées depuis minuit la veille (heure de Paris). */
export function noticesSince(records: Array<{ data: NotificationData; created_at: string }>, type: NotificationData['type'], day: string) {
  const since = parisTimeToUtc(addDays(day, -1), 0).toISOString();
  return records
    .filter((r) => r.data.type === type && r.created_at >= since)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => ({ title: r.data.title, body: r.data.body, path: r.data.path }));
}

/**
 * Défi du jour, du plus précis au plus général :
 * 1. une vidéo prévue aujourd'hui dans un plan de publication (Pro) ;
 * 2. sinon la plus ancienne vidéo en retard d'un plan ;
 * 3. sinon la prochaine vidéo d'un produit suivi pas encore à son objectif ;
 * 4. sinon une première vidéo sur le n°1 du jour.
 */
export function pickChallenge(input: {
  day: string;
  plans: Array<{ id: string; data: PublicationPlan }>;
  saved: Array<{ product_id: string; name: string; videos_posted: number; video_goal: number }>;
  top: { id: string; name: string } | null;
}): DigestChallenge | null {
  const { day } = input;
  const open = input.plans.flatMap((p) =>
    p.data.items.filter((i) => i.status !== 'poste').map((item) => ({ plan: p, item, total: p.data.items.length })),
  );
  const today = open.filter((o) => o.item.date === day).sort((a, b) => a.item.n - b.item.n);
  if (today.length) {
    const first = today[0];
    const others = today.length - 1;
    return {
      kind: 'plan',
      text: `Poste ta vidéo n°${first.item.n} sur ${first.plan.data.product_name}`,
      detail: `Prévue aujourd’hui dans ton plan (${first.item.n} sur ${first.total})${others ? `, et ${others} autre${others > 1 ? 's' : ''} vidéo${others > 1 ? 's' : ''} prévue${others > 1 ? 's' : ''}` : ''}.`,
      path: `/app/plan#plan-${first.plan.id}`,
      product_id: first.plan.data.product_id,
    };
  }
  const late = open.filter((o) => o.item.date < day).sort((a, b) => a.item.date.localeCompare(b.item.date) || a.item.n - b.item.n);
  if (late.length) {
    const first = late[0];
    return {
      kind: 'retard',
      text: `Rattrape ta vidéo n°${first.item.n} sur ${first.plan.data.product_name}`,
      detail: `Elle était prévue le ${formatDayMonth(first.item.date)}${late.length > 1 ? ` (${late.length} vidéos en retard)` : ''}.`,
      path: `/app/plan#plan-${first.plan.id}`,
      product_id: first.plan.data.product_id,
    };
  }
  const next = input.saved
    .filter((s) => s.videos_posted < s.video_goal)
    .sort((a, b) => b.videos_posted - a.videos_posted || a.name.localeCompare(b.name))[0];
  if (next) {
    return {
      kind: 'objectif',
      text: `Poste ta vidéo n°${next.videos_posted + 1} sur ${next.name}`,
      detail: `${next.videos_posted} sur ${next.video_goal} vidéos : continue sur le même produit.`,
      path: '/app/mes-produits',
      product_id: next.product_id,
    };
  }
  if (input.top) {
    return {
      kind: 'premiere',
      text: `Tourne une vidéo sur ${input.top.name}`,
      detail: 'Le n°1 de tes produits du jour : ton script est prêt ci-dessous.',
      path: `/app/studio?produit=${input.top.id}`,
      product_id: input.top.id,
    };
  }
  return null;
}

/** Partie personnelle du récap du matin d'un utilisateur. */
export async function buildPersonal(
  profile: Profile,
  content: DigestContent,
  day: string,
  repo: Repo = getRepo(),
): Promise<DigestPersonal> {
  const [notifications, plans, saved] = await Promise.all([
    repo.listRecords<NotificationData>(profile.id, 'notification'),
    getPlan(profile.plan).planning ? repo.listRecords<PublicationPlan>(profile.id, 'publication') : Promise.resolve([]),
    repo.listSavedProducts(profile.id),
  ]);
  const alerts = noticesSince(notifications, 'alerte', day);
  const drops = noticesSince(notifications, 'baisse', day);
  const products = saved.length ? await repo.getProducts(saved.map((s) => s.product_id)) : [];
  const names = new Map(products.map((p) => [p.id, p.name]));
  const top = content.products[0] ?? null;
  return {
    alerts: alerts.slice(0, MAX_NOTICES),
    drops: drops.slice(0, MAX_NOTICES),
    alerts_total: alerts.length,
    drops_total: drops.length,
    challenge: pickChallenge({
      day,
      plans,
      saved: saved
        .filter((s) => names.has(s.product_id))
        .map((s) => ({ product_id: s.product_id, name: names.get(s.product_id)!, videos_posted: s.videos_posted, video_goal: s.video_goal })),
      top: top ? { id: top.id, name: top.name } : null,
    }),
  };
}
