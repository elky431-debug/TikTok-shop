import { getRepo } from '@/lib/db';
import type { Coach, CoachStudent, PlanId } from '@/lib/db/types';
import { addDays, parisDate } from '@/lib/utils';

export interface CoachDashboard {
  students: CoachStudent[];
  total: number;
  activeThisWeek: number;
  plans: Record<PlanId, number>;
  eligible: number;
  scriptsTotal: number;
  commissionThisMonthCents: number;
  commissionDueCents: number;
  signupsByWeek: Array<{ label: string; inscrits: number }>;
}

/** Tableau de bord formateur : uniquement des données agrégées sur ses élèves. */
export async function getCoachDashboard(coach: Coach, now = new Date()): Promise<CoachDashboard> {
  const repo = getRepo();
  const [students, commissions] = await Promise.all([repo.listCoachStudents(coach.id), repo.listCommissions(coach.user_id)]);
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const month = parisDate(now).slice(0, 7);
  const plans: Record<PlanId, number> = { free: 0, pro: 0, proplus: 0 };
  for (const s of students) plans[s.plan]++;

  const today = parisDate(now);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = addDays(today, -7 * (7 - i));
    const start = addDays(end, -6);
    return { start, end, label: `${start.slice(8, 10)}/${start.slice(5, 7)}` };
  });
  const signupsByWeek = weeks.map((w) => ({
    label: w.label,
    inscrits: students.filter((s) => {
      const d = parisDate(new Date(s.joined_at));
      return d >= w.start && d <= w.end;
    }).length,
  }));

  return {
    students,
    total: students.length,
    activeThisWeek: students.filter((s) => s.last_seen_at && new Date(s.last_seen_at).getTime() >= weekAgo).length,
    plans,
    eligible: students.filter((s) => s.eligibility === 'affilie').length,
    scriptsTotal: students.reduce((sum, s) => sum + s.scripts_generated, 0),
    commissionThisMonthCents: commissions.filter((c) => c.month === month).reduce((s, c) => s + c.amount_cents, 0),
    commissionDueCents: commissions.filter((c) => c.status === 'due').reduce((s, c) => s + c.amount_cents, 0),
    signupsByWeek,
  };
}
