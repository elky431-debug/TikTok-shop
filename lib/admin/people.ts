import { getRepo, type Repo } from '@/lib/db';
import type { Coach, PlanId, Profile } from '@/lib/db/types';
import { mapWithConcurrency } from '@/lib/jobs/concurrency';
import { getEarnings, listCoachCodes, type Earnings } from '@/lib/referral';

/** Recherche d'utilisateurs : e-mail, prénom, pseudo TikTok ou ancien code personnel ; filtre par plan. */
export function filterProfiles(profiles: Profile[], query: string, plan?: PlanId | 'tous'): Profile[] {
  const q = query.trim().toLowerCase();
  return profiles.filter((p) => {
    if (plan && plan !== 'tous' && p.plan !== plan) return false;
    if (!q) return true;
    return [p.email, p.first_name, p.tiktok_handle, p.referral_code].some((v) => v?.toLowerCase().includes(q));
  });
}

export interface Beneficiary {
  profile: Profile | null;
  userId: string;
  coach: Coach | null;
  earnings: Earnings;
}

/** Formateurs (et anciens liens d'invitation) qui ont gagné quelque chose (pour marquer les versements). */
export async function listBeneficiaries(repo: Repo = getRepo(), now = new Date()): Promise<Beneficiary[]> {
  const [profiles, coaches] = await Promise.all([repo.listProfiles({ limit: 1000 }), repo.listCoaches()]);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const coachByUser = new Map(coaches.map((c) => [c.user_id, c]));
  const ids = [...new Set([...coaches.map((c) => c.user_id), ...profiles.map((p) => p.referred_by).filter((x): x is string => Boolean(x))])];
  const all = await mapWithConcurrency(ids, 8, async (userId) => ({
    userId,
    profile: byId.get(userId) ?? (await repo.getProfile(userId)),
    coach: coachByUser.get(userId) ?? null,
    earnings: await getEarnings(userId, repo, now),
  }));
  return all
    .filter((b) => b.earnings.earnedCents !== 0 || b.earnings.paidCents !== 0 || b.coach)
    .sort((a, b) => b.earnings.balanceCents - a.earnings.balanceCents);
}

export interface CoachRow {
  coach: Coach;
  email: string | null;
  students: number;
  codes: Awaited<ReturnType<typeof listCoachCodes>>;
}

export async function listCoachRows(repo: Repo = getRepo()): Promise<CoachRow[]> {
  const [coaches, profiles] = await Promise.all([repo.listCoaches(), repo.listProfiles({ limit: 1000 })]);
  const emailById = new Map(profiles.map((p) => [p.id, p.email]));
  return mapWithConcurrency(coaches, 8, async (coach) => ({
    coach,
    email: emailById.get(coach.user_id) ?? null,
    students: profiles.filter((p) => p.coach_id === coach.id).length,
    codes: await listCoachCodes(coach, repo),
  }));
}
