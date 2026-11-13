import { grantPlan } from '@/lib/billing/grant';
import { simulateSubscription } from '@/lib/billing/simulated';
import type { Repo } from '@/lib/db';
import { LOCAL_ADMIN_EMAIL } from '@/lib/env';

/**
 * Comptes de démonstration (mode local) : un formateur et deux élèves fictifs, pour voir l'espace formateur sans
 * attendre de vrais inscrits. Tout est payant : le formateur et l'admin ont un plan Elite offert, Yanis un abonnement
 * Pro simulé (sa commission apparaît chez le formateur), Inès n'a pas encore choisi d'abonnement.
 * Seulement en base locale : en production, les comptes viennent de Supabase Auth.
 */
export async function seedDemoAccounts(repo: Repo): Promise<string[]> {
  if (repo.kind !== 'local') return [];
  const coachUser = { id: '00000000-0000-4000-8000-0000000000c1', email: 'formateur@tracktout.local' };
  const coachProfile = await repo.ensureProfile(coachUser);
  await repo.updateProfile(coachUser.id, {
    first_name: 'Camille',
    follower_range: '20000-100000',
    affiliate_status: 'oui',
    experience_level: 'regulier',
    videos_per_week: '4-7',
    niches: ['beaute', 'maison'],
    video_style: 'face_camera',
    video_styles: ['face_camera'],
    onboarding_version: 2,
    onboarded_at: new Date().toISOString(),
  });
  let coach = await repo.getCoachByUserId(coachUser.id);
  coach ??= await repo.createCoach({
    user_id: coachUser.id,
    training_name: 'Formation Démo TikTok Shop',
    promo_code: 'DEMO30',
    commission_rate: 0.3,
  });

  const students = [
    { id: '00000000-0000-4000-8000-0000000000e1', email: 'eleve1@tracktout.local', first_name: 'Inès', range: '0-1000' as const },
    { id: '00000000-0000-4000-8000-0000000000e2', email: 'eleve2@tracktout.local', first_name: 'Yanis', range: '5000-20000' as const },
  ];
  for (const s of students) {
    await repo.ensureProfile(s);
    await repo.updateProfile(s.id, {
      first_name: s.first_name,
      follower_range: s.range,
      experience_level: 'debute',
      videos_per_week: '1-3',
      niches: ['beaute'],
      video_style: 'voix_off',
      video_styles: ['voix_off'],
      onboarding_version: 2,
      onboarded_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      coach_id: coach.id,
    });
    if (!(await repo.getReferralByReferred(s.id))) await repo.createReferral({ referrer_id: coachUser.id, referred_id: s.id, coach_id: coach.id });
  }
  const yanis = await repo.getProfile(students[1].id);
  if (yanis && yanis.plan === 'aucun') await simulateSubscription(yanis, 'pro', 'month', repo, { coachDiscount: true });

  const admin = await repo.ensureProfile({ id: '00000000-0000-4000-8000-0000000000a1', email: LOCAL_ADMIN_EMAIL });
  if (!admin.onboarded_at) {
    await repo.updateProfile(admin.id, {
      first_name: 'Admin',
      follower_range: '1000-5000',
      niches: ['beaute'],
      onboarding_version: 2,
      onboarded_at: new Date().toISOString(),
    });
  }
  await grantPlan(coachUser.id, 'elite', repo);
  await grantPlan(admin.id, 'elite', repo);
  return [coachProfile.email, ...students.map((s) => s.email), LOCAL_ADMIN_EMAIL];
}
