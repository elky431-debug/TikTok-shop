import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getCoachDashboard } from '@/lib/coach';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { applyReferralCode } from '@/lib/referral';

const repo = new LocalRepo(null);
beforeAll(() => setRepoForTests(repo));
afterAll(() => setRepoForTests(null));

describe('espace formateur', () => {
  it('ne montre que des données agrégées, et l’e-mail seulement avec consentement', async () => {
    await repo.ensureProfile({ id: 'c', email: 'coach@test.fr' });
    const coach = await repo.createCoach({ user_id: 'c', training_name: 'Formation', promo_code: 'FORM30', commission_rate: 0.3 });
    for (const [id, share] of [
      ['e1', false],
      ['e2', true],
    ] as const) {
      const p = await repo.ensureProfile({ id, email: `${id}@test.fr` });
      await repo.updateProfile(id, { first_name: id.toUpperCase(), share_email_with_coach: share, last_seen_at: new Date().toISOString() });
      await applyReferralCode((await repo.getProfile(p.id))!, 'FORM30');
    }
    await repo.insertScript({
      user_id: 'e1',
      product_id: 'x',
      format: 'demo',
      hooks: [],
      script: [],
      full_text: '',
      source: 'simulation',
      saved: false,
      regen_count: 0,
    });
    const data = await getCoachDashboard(coach);
    expect(data.total).toBe(2);
    expect(data.activeThisWeek).toBe(2);
    expect(data.scriptsTotal).toBe(1);
    const e1 = data.students.find((s) => s.student_id === 'e1')!;
    const e2 = data.students.find((s) => s.student_id === 'e2')!;
    expect(e1.email).toBeNull();
    expect(e2.email).toBe('e2@test.fr');
    expect(Object.keys(e1).sort()).toEqual(
      ['email', 'eligibility', 'first_name', 'joined_at', 'last_seen_at', 'plan', 'products_followed', 'scripts_generated', 'student_id'].sort(),
    );
    expect(data.signupsByWeek).toHaveLength(8);
    expect(data.signupsByWeek.at(-1)!.inscrits).toBe(2);
  });
});
