import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import CoachLandingPage, { generateMetadata } from '@/app/(public)/f/[code]/page';
import {
  ANNOUNCE_KIND,
  CONSENT_KIND,
  getCoachDashboard,
  getStudentConsent,
  listAnnouncements,
  publishAnnouncement,
  setStudentConsent,
} from '@/lib/coach';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { Coach } from '@/lib/db/types';
import { addCoachCode, applyReferralCode, COACH_LINK_KIND, describeCode, listCoachCodes, setCoachCodeActive } from '@/lib/referral';

let repo: LocalRepo;
let coach: Coach;

async function student(id: string, code: string, opts: { share?: boolean; seen?: boolean } = {}) {
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  await repo.updateProfile(id, {
    first_name: id.toUpperCase(),
    share_email_with_coach: opts.share ?? false,
    last_seen_at: opts.seen === false ? null : new Date().toISOString(),
  });
  return applyReferralCode((await repo.getProfile(id))!, code);
}

beforeEach(async () => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
  await repo.ensureProfile({ id: 'c', email: 'coach@test.fr' });
  coach = await repo.createCoach({ user_id: 'c', training_name: 'Formation Shop', promo_code: 'FORM30', commission_rate: 0.3 });
});
afterAll(() => setRepoForTests(null));

describe('tableau de bord formateur (agrégats)', () => {
  it('compte inscrits, actifs, abonnés, vidéos postées et scripts, sans rien d’individuel sans consentement', async () => {
    await student('e1', 'FORM30');
    await student('e2', 'form30', { share: true });
    await student('e3', 'FORM30', { seen: false });
    await repo.insertScript({ user_id: 'e1', product_id: 'x', format: 'demo', hooks: [], script: [], full_text: '', source: 'simulation', saved: false, regen_count: 0 });
    await repo.saveProduct('e1', 'p1', 20);
    await repo.updateSavedProduct('e1', 'p1', { videos_posted: 4 });
    await repo.saveProduct('e2', 'p2', 20);
    await repo.updateSavedProduct('e2', 'p2', { videos_posted: 3 });
    const referral = await repo.getReferralByReferred('e2');
    await repo.updateReferral(referral!.id, { status: 'abonne' });
    const trial = await repo.getReferralByReferred('e3');
    await repo.updateReferral(trial!.id, { status: 'essai' });

    const data = await getCoachDashboard(coach);
    expect(data).toMatchObject({ total: 3, activeThisWeek: 2, subscribed: 1, trial: 1, scriptsTotal: 1, videosPosted: 7, productsFollowed: 2 });
    expect(data.consented).toEqual([]);
    expect(JSON.stringify(data)).not.toContain('E1');
    expect(JSON.stringify(data)).not.toContain('e2@test.fr');
    expect(data.signupsByWeek).toHaveLength(8);
    expect(data.signupsByWeek.at(-1)!.inscrits).toBe(3);
  });
});

describe('consentement de l’élève (explicite, révocable)', () => {
  it('le détail n’apparaît qu’avec l’accord, disparaît dès qu’il est retiré, et l’e-mail suit son propre accord', async () => {
    await student('e1', 'FORM30');
    await student('e2', 'FORM30');
    const e1 = (await repo.getProfile('e1'))!;
    expect(await getStudentConsent(e1)).toEqual({ detail: false, email: false, updatedAt: null });

    await setStudentConsent(e1, { detail: true, email: false });
    let data = await getCoachDashboard(coach);
    expect(data.consented.map((s) => s.student_id)).toEqual(['e1']);
    expect(data.consented[0]).toMatchObject({ first_name: 'E1', email: null, code: 'FORM30' });

    await setStudentConsent((await repo.getProfile('e1'))!, { detail: true, email: true });
    data = await getCoachDashboard(coach);
    expect(data.consented[0].email).toBe('e1@test.fr');

    await setStudentConsent((await repo.getProfile('e1'))!, { detail: false, email: false });
    data = await getCoachDashboard(coach);
    expect(data.consented).toEqual([]);
    expect((await repo.getProfile('e1'))!.share_email_with_coach).toBe(false);
    // Une seule fiche par élève, mise à jour (pas d'accumulation).
    expect(await repo.listRecords('e1', CONSENT_KIND)).toHaveLength(1);
  });

  it('un accord donné à un autre formateur ne vaut pas pour celui-ci', async () => {
    await student('e1', 'FORM30');
    await repo.saveRecord('e1', CONSENT_KIND, { coach_id: 'autre', detail: true, updated_at: new Date().toISOString() });
    expect((await getCoachDashboard(coach)).consented).toEqual([]);
  });
});

describe('plusieurs codes par formateur', () => {
  it('crée des codes uniques ; l’inscription avec n’importe lequel rattache l’élève au formateur et à ce code', async () => {
    await repo.ensureProfile({ id: 'parrain', email: 'p@test.fr' });
    const parrainCode = (await repo.getProfile('parrain'))!.referral_code;
    expect(await addCoachCode(coach, 'x', '')).toEqual({ ok: false, error: 'format' });
    expect(await addCoachCode(coach, 'form30', '')).toEqual({ ok: false, error: 'pris' });
    expect(await addCoachCode(coach, parrainCode, '')).toEqual({ ok: false, error: 'pris' });
    expect(await addCoachCode(coach, 'promo-janvier', 'Promo de janvier')).toEqual({ ok: true, code: 'PROMO-JANVIER' });
    expect(await addCoachCode(coach, 'PROMO-JANVIER', '')).toEqual({ ok: false, error: 'pris' });

    const found = await describeCode('promo-janvier');
    expect(found).toMatchObject({ kind: 'coach', code: 'PROMO-JANVIER' });
    expect((await student('e1', 'promo-janvier')).kind).toBe('coach');
    await student('e2', 'FORM30');
    expect((await repo.getProfile('e1'))!.coach_id).toBe(coach.id);
    expect((await repo.listRecords('e1', COACH_LINK_KIND))[0].data).toEqual({ coach_id: coach.id, code: 'PROMO-JANVIER' });

    const data = await getCoachDashboard(coach);
    expect(data.byCode.map((c) => [c.code, c.students])).toEqual([
      ['FORM30', 1],
      ['PROMO-JANVIER', 1],
    ]);

    const extra = (await listCoachCodes(coach)).find((c) => !c.main)!;
    await setCoachCodeActive(coach, extra.id!, false);
    expect((await describeCode('PROMO-JANVIER')).kind).toBe('none');
    // Un autre compte ne peut pas mettre en pause le code d'un formateur.
    const other = await repo.createCoach({ user_id: 'parrain', training_name: 'Autre', promo_code: 'AUTRE30', commission_rate: 0.3 });
    expect(await setCoachCodeActive(other, extra.id!, true)).toBe(false);
  });
});

describe('page co-brandée /f/[code]', () => {
  it('affiche le nom de la formation et l’offre de 3 mois, pas d’indexation ; 404 pour un code inconnu ou de parrainage', async () => {
    await addCoachCode(coach, 'PROMO2', 'Promo 2');
    const html = renderToStaticMarkup(await CoachLandingPage({ params: { code: 'promo2' } }));
    expect(html).toContain('Proposé par Formation Shop');
    expect(html).toContain('3 mois de Pro');
    expect(html).toContain('href="/r/PROMO2"');
    expect(html).not.toMatch(/gagne[rsz]? \d|€ par mois de gains/);
    const meta = await generateMetadata({ params: { code: 'FORM30' } });
    expect(meta.title).toBe('Formation Shop t’offre 3 mois de Tracktout Pro');
    expect(meta.robots).toMatchObject({ index: false });

    await repo.ensureProfile({ id: 'parrain', email: 'p@test.fr' });
    const parrainCode = (await repo.getProfile('parrain'))!.referral_code;
    for (const code of ['INCONNU', parrainCode]) {
      await expect(CoachLandingPage({ params: { code } })).rejects.toThrow(/NEXT_NOT_FOUND/);
    }
  });
});

describe('annonces', () => {
  it('chaque élève reçoit une notification « annonce » ; 3 annonces par jour au plus', async () => {
    expect(await publishAnnouncement(coach, { title: 'Live', body: 'Jeudi 19 h' })).toEqual({ ok: false, error: 'aucun' });
    await student('e1', 'FORM30');
    await student('e2', 'FORM30');
    expect(await publishAnnouncement(coach, { title: '', body: 'x' })).toEqual({ ok: false, error: 'vide' });
    expect(await publishAnnouncement(coach, { title: 'Live de jeudi', body: 'On analyse vos vidéos à 19 h.' })).toEqual({ ok: true, recipients: 2 });
    for (const id of ['e1', 'e2']) {
      const [n] = await repo.listRecords<{ type: string; title: string; path: string }>(id, 'notification');
      expect(n.data).toMatchObject({ type: 'annonce', title: 'Formation Shop : Live de jeudi', path: '/app/consentement-formateur' });
    }
    expect((await listAnnouncements(coach)).map((a) => a.data.title)).toEqual(['Live de jeudi']);
    await publishAnnouncement(coach, { title: 'Deux', body: 'Message deux' });
    await publishAnnouncement(coach, { title: 'Trois', body: 'Message trois' });
    expect(await publishAnnouncement(coach, { title: 'Quatre', body: 'Message quatre' })).toEqual({ ok: false, error: 'limite' });
    expect(await repo.listRecords('c', ANNOUNCE_KIND)).toHaveLength(3);
  });
});
