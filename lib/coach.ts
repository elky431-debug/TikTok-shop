import { getRepo, type Repo } from '@/lib/db';
import type { Coach, CoachStudent, Eligibility, PlanId, Profile, ReferralStatus } from '@/lib/db/types';
import { mapWithConcurrency } from '@/lib/jobs/concurrency';
import { notify } from '@/lib/notify';
import { COACH_LINK_KIND, getEarnings, listCoachCodes, type CoachLinkData, type Earnings } from '@/lib/referral';
import { addDays, parisDate, parisTimeToUtc } from '@/lib/utils';

/**
 * Espace formateur. RGPD : sans consentement, le formateur ne voit que des agrégats (nombres sur l'ensemble de ses
 * élèves) ; le détail d'un élève (prénom, plan, progression) n'apparaît que s'il l'a accepté explicitement, et
 * disparaît dès qu'il le retire (fiche `consentement_formateur` de l'élève). L'e-mail suit son propre accord
 * (`profiles.share_email_with_coach`), comme dans la fonction SQL coach_students().
 */
export const CONSENT_KIND = 'consentement_formateur';
export const ANNOUNCE_KIND = 'annonce_formateur';
/** Annonces par formateur et par jour (anti-envoi en masse). */
export const ANNOUNCES_PER_DAY = 3;

export interface ConsentData {
  coach_id: string;
  /** Le formateur voit le détail de sa progression. */
  detail: boolean;
  updated_at: string;
}

export interface AnnouncementData {
  title: string;
  body: string;
  recipients: number;
}

export interface StudentDetail {
  student_id: string;
  first_name: string | null;
  plan: PlanId;
  status: ReferralStatus | null;
  eligibility: Eligibility;
  scripts_generated: number;
  products_followed: number;
  videos_posted: number;
  last_seen_at: string | null;
  joined_at: string;
  code: string;
  email: string | null;
}

export interface CoachDashboard {
  total: number;
  activeThisWeek: number;
  /** Paient leur abonnement (statut « abonné » du parrainage). */
  subscribed: number;
  /** En essai (ancienne grille : les 3 mois offerts ; plus d'essai depuis la nouvelle grille). */
  trial: number;
  canceled: number;
  plans: Record<PlanId, number>;
  eligible: number;
  scriptsTotal: number;
  videosPosted: number;
  productsFollowed: number;
  signupsByWeek: Array<{ label: string; inscrits: number }>;
  byCode: Array<{ code: string; label: string; main: boolean; active: boolean; id: string | null; students: number; subscribed: number }>;
  /** Élèves qui ont accepté de montrer leur progression (les seuls listés un par un). */
  consented: StudentDetail[];
  earnings: Earnings;
}

/** Consentement de chaque élève pour ce formateur (true = détail visible). */
async function consentMap(coach: Coach, repo: Repo): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  const records = (await repo.listAllRecords<ConsentData>(CONSENT_KIND)).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  for (const r of records) if (r.data?.coach_id === coach.id) map.set(r.user_id, r.data.detail === true);
  return map;
}

export async function getCoachDashboard(coach: Coach, now = new Date(), repo: Repo = getRepo()): Promise<CoachDashboard> {
  const [students, referrals, consents, links, codes, earnings] = await Promise.all([
    repo.listCoachStudents(coach.id),
    repo.listReferralsByReferrer(coach.user_id),
    consentMap(coach, repo),
    repo.listAllRecords<CoachLinkData>(COACH_LINK_KIND),
    listCoachCodes(coach, repo),
    getEarnings(coach.user_id, repo, now),
  ]);
  const statusOf = new Map(referrals.map((r) => [r.referred_id, r.status]));
  const codeOf = new Map(links.filter((l) => l.data?.coach_id === coach.id).map((l) => [l.user_id, l.data.code]));
  const videos = await mapWithConcurrency(students, 8, async (s) =>
    (await repo.listSavedProducts(s.student_id)).reduce((sum, p) => sum + p.videos_posted, 0),
  );
  const videosOf = new Map(students.map((s, i) => [s.student_id, videos[i]]));

  const weekAgo = now.getTime() - 7 * 86_400_000;
  const plans: Record<PlanId, number> = { aucun: 0, starter: 0, pro: 0, elite: 0 };
  for (const s of students) plans[s.plan]++;
  const status = (s: CoachStudent) => statusOf.get(s.student_id) ?? null;
  const code = (s: CoachStudent) => codeOf.get(s.student_id) ?? coach.promo_code;

  const today = parisDate(now);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = addDays(today, -7 * (7 - i));
    const start = addDays(end, -6);
    return { start, end, label: `${start.slice(8, 10)}/${start.slice(5, 7)}` };
  });

  return {
    total: students.length,
    activeThisWeek: students.filter((s) => s.last_seen_at && new Date(s.last_seen_at).getTime() >= weekAgo).length,
    subscribed: students.filter((s) => status(s) === 'abonne').length,
    trial: students.filter((s) => status(s) === 'essai').length,
    canceled: students.filter((s) => status(s) === 'resilie').length,
    plans,
    eligible: students.filter((s) => s.eligibility === 'affilie').length,
    scriptsTotal: students.reduce((sum, s) => sum + s.scripts_generated, 0),
    videosPosted: videos.reduce((sum, n) => sum + n, 0),
    productsFollowed: students.reduce((sum, s) => sum + s.products_followed, 0),
    signupsByWeek: weeks.map((w) => ({
      label: w.label,
      inscrits: students.filter((s) => {
        const d = parisDate(new Date(s.joined_at));
        return d >= w.start && d <= w.end;
      }).length,
    })),
    byCode: codes.map((c) => {
      const mine = students.filter((s) => code(s) === c.code);
      return { ...c, students: mine.length, subscribed: mine.filter((s) => status(s) === 'abonne').length };
    }),
    consented: students
      .filter((s) => consents.get(s.student_id) === true)
      .map((s) => ({
        student_id: s.student_id,
        first_name: s.first_name,
        plan: s.plan,
        status: status(s),
        eligibility: s.eligibility,
        scripts_generated: s.scripts_generated,
        products_followed: s.products_followed,
        videos_posted: videosOf.get(s.student_id) ?? 0,
        last_seen_at: s.last_seen_at,
        joined_at: s.joined_at,
        code: code(s),
        email: s.email,
      })),
    earnings,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Côté élève : consentement explicite et révocable (page /app/consentement-formateur).
// ---------------------------------------------------------------------------------------------------------------------
export async function getStudentConsent(profile: Profile, repo: Repo = getRepo()): Promise<{ detail: boolean; email: boolean; updatedAt: string | null }> {
  if (!profile.coach_id) return { detail: false, email: false, updatedAt: null };
  const record = (await repo.listRecords<ConsentData>(profile.id, CONSENT_KIND)).find((r) => r.data?.coach_id === profile.coach_id);
  return { detail: record?.data.detail === true, email: profile.share_email_with_coach, updatedAt: record?.data.updated_at ?? null };
}

export async function setStudentConsent(profile: Profile, input: { detail: boolean; email: boolean }, repo: Repo = getRepo(), now = new Date()) {
  if (!profile.coach_id) return;
  const existing = (await repo.listRecords<ConsentData>(profile.id, CONSENT_KIND)).find((r) => r.data?.coach_id === profile.coach_id);
  await repo.saveRecord<ConsentData>(profile.id, CONSENT_KIND, { coach_id: profile.coach_id, detail: input.detail, updated_at: now.toISOString() }, existing?.id);
  if (profile.share_email_with_coach !== input.email) await repo.updateProfile(profile.id, { share_email_with_coach: input.email });
}

// ---------------------------------------------------------------------------------------------------------------------
// Annonces : le formateur écrit, chaque élève reçoit une notification « annonce » dans l'appli (lib/notify.ts).
// ---------------------------------------------------------------------------------------------------------------------
export type AnnounceResult = { ok: true; recipients: number } | { ok: false; error: 'vide' | 'limite' | 'aucun' };

export async function publishAnnouncement(
  coach: Coach,
  input: { title: string; body: string },
  repo: Repo = getRepo(),
  now = new Date(),
): Promise<AnnounceResult> {
  const title = input.title.trim().replace(/\s+/g, ' ').slice(0, 80);
  const body = input.body.trim().slice(0, 1000);
  if (title.length < 3 || body.length < 3) return { ok: false, error: 'vide' };
  const since = parisTimeToUtc(parisDate(now), 0).toISOString();
  if ((await repo.countRecordsSince(coach.user_id, ANNOUNCE_KIND, since)) >= ANNOUNCES_PER_DAY) return { ok: false, error: 'limite' };
  const students = await repo.listCoachStudents(coach.id);
  if (!students.length) return { ok: false, error: 'aucun' };
  await repo.saveRecord<AnnouncementData>(coach.user_id, ANNOUNCE_KIND, { title, body, recipients: students.length });
  await mapWithConcurrency(students, 8, (s) =>
    notify(
      s.student_id,
      { type: 'annonce', title: `${coach.training_name} : ${title}`, body, path: '/app/consentement-formateur', action: 'Lire l’annonce', channels: { push: true } },
      repo,
    ).catch((error) => console.warn('[annonce]', s.student_id, error instanceof Error ? error.message : error)),
  );
  return { ok: true, recipients: students.length };
}

export async function listAnnouncements(coach: Pick<Coach, 'user_id'>, repo: Repo = getRepo(), limit = 20) {
  return (await repo.listRecords<AnnouncementData>(coach.user_id, ANNOUNCE_KIND))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}
