import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { buildDataExport, exportFileName } from '@/lib/rgpd';

let repo: LocalRepo;
beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});
afterEach(() => setRepoForTests(null));

async function seed(id: string) {
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  await repo.updateProfile(id, { first_name: id, niches: ['beaute'], onboarded_at: '2026-11-01T00:00:00Z' });
  await repo.saveRecord(id, 'gain', { amount_cents: 1200 });
  await repo.saveRecord(id, 'notification', { title: 'Alerte' });
  await repo.saveRecord(id, 'type_inconnu_futur', { x: 1 }); // un module ajouté plus tard : exporté et supprimé aussi
  await repo.saveRecord(id, 'push_abonnement', { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'secret', auth: 'secret' }, device: 'Chrome' });
  await repo.claimDailyTask(`recap-dimanche:${id}`, '2026-11-15');
  await repo.upsertDigest({ user_id: id, day: '2026-11-12', content: { date: '2026-11-12' } as never, email_status: 'sent', discord_status: 'skipped' });
}

describe('RGPD', () => {
  it('export : toutes les données du compte (fiches de tous types), clés push masquées, rien des autres', async () => {
    await seed('lea');
    await seed('max');
    await repo.createReferral({ referrer_id: 'lea', referred_id: 'max', coach_id: null });
    const data = await buildDataExport('lea', repo, new Date('2026-11-13T10:00:00Z'));
    expect(data.profil?.email).toBe('lea@test.fr');
    expect(Object.keys(data.fiches).sort()).toEqual(['gain', 'notification', 'push_abonnement', 'type_inconnu_futur']);
    expect(JSON.stringify(data.fiches.push_abonnement)).not.toContain('"secret"');
    expect(data.recaps_du_matin).toHaveLength(1);
    expect(data.parrainage.faits).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain('max@test.fr');
    expect(exportFileName(new Date('2026-11-13T10:00:00Z'))).toBe('tracktout-mes-donnees-2026-11-13.json');
  });

  it('suppression : fiches de tous types, récaps et tâches du compte effacées ; l’autre compte intact', async () => {
    await seed('lea');
    await seed('max');
    await repo.deleteUser('lea');
    const gone = await repo.exportUserData('lea');
    expect(gone.profile).toBeNull();
    expect(gone.records).toEqual([]);
    expect(gone.digests).toEqual([]);
    expect(await repo.claimDailyTask('recap-dimanche:lea', '2026-11-15')).toBe(true); // réservation effacée
    const kept = await repo.exportUserData('max');
    expect(kept.records).toHaveLength(4);
    expect(await repo.claimDailyTask('recap-dimanche:max', '2026-11-15')).toBe(false);
  });
});
