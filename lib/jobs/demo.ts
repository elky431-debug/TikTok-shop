import type { Repo } from '@/lib/db';
import { LOCAL_ADMIN_EMAIL } from '@/lib/env';

/**
 * Comptes de démonstration (mode local) : un formateur et deux élèves fictifs,
 * pour voir l'espace formateur sans attendre de vrais inscrits.
 * Seulement en base locale : en production, les comptes viennent de Supabase Auth.
 */
export async function seedDemoAccounts(repo: Repo): Promise<string[]> {
  if (repo.kind !== 'local') return [];
  const coachUser = { id: '00000000-0000-4000-8000-0000000000c1', email: 'formateur@pepite.local' };
  const coachProfile = await repo.ensureProfile(coachUser);
  await repo.updateProfile(coachUser.id, {
    first_name: 'Camille',
    follower_range: '20000+',
    niches: ['beaute', 'maison'],
    video_style: 'face_camera',
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
    { id: '00000000-0000-4000-8000-0000000000e1', email: 'eleve1@pepite.local', first_name: 'Inès', range: '500-1500' as const },
    { id: '00000000-0000-4000-8000-0000000000e2', email: 'eleve2@pepite.local', first_name: 'Yanis', range: '1500-5000' as const },
  ];
  for (const s of students) {
    await repo.ensureProfile(s);
    await repo.updateProfile(s.id, {
      first_name: s.first_name,
      follower_range: s.range,
      niches: ['beaute'],
      video_style: 'voix_off',
      onboarded_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      coach_id: coach.id,
    });
    await repo.createReferral({ referrer_id: coachUser.id, referred_id: s.id, coach_id: coach.id });
  }

  await repo.ensureProfile({ id: '00000000-0000-4000-8000-0000000000a1', email: LOCAL_ADMIN_EMAIL });
  return [coachProfile.email, ...students.map((s) => s.email), LOCAL_ADMIN_EMAIL];
}
