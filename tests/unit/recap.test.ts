import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as oneClickRoute } from '@/app/api/recap/desinscription/route';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { Profile } from '@/lib/db/types';
import { applyObservation, attributionDay, bestStreak, currentStreak, totalsByDay, type VideoHistory } from '@/lib/digest/history';
import { runRecapHourly } from '@/lib/digest/hourly';
import { noticesSince, pickChallenge, type PersonalDigestContent } from '@/lib/digest/personal';
import { prepareDigests } from '@/lib/digest/prepare';
import { scheduleDigestEmails } from '@/lib/digest/deliver';
import { getRecapSettings, saveRecapSettings } from '@/lib/digest/settings';
import { buildWeeklyRecap, isSunday, WEEKLY_RECAP_KIND } from '@/lib/digest/weekly';
import { refreshCatalog } from '@/lib/jobs/refresh';
import { applyUnsubscribe } from '@/lib/lifecycle/unsubscribe';
import { getDisabledLifecycle } from '@/lib/lifecycle/preferences';
import type { NotificationData } from '@/lib/notify';
import { registerPushSender } from '@/lib/push';
import { unsubscribeHeaders, unsubscribeToken, unsubscribeUrls, verifyUnsubscribeToken } from '@/lib/unsubscribe';
import { buildPlan, type PublicationPlan } from '@/lib/v2/planning';

const DAY = '2026-11-12'; // jeudi
const SUNDAY = '2026-11-15';

let repo: LocalRepo;
beforeEach(async () => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: DAY });
});
afterEach(() => {
  setRepoForTests(null);
  registerPushSender(null);
  vi.useRealTimers();
});

async function member(id: string, patch: Partial<Profile> = {}): Promise<Profile> {
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  return repo.updateProfile(id, { niches: ['beaute'], onboarded_at: '2026-11-01T10:00:00Z', first_name: 'Léa', ...patch });
}

describe('récap du matin personnalisé', () => {
  it('défi du jour : vidéo prévue aujourd’hui, sinon en retard, sinon l’objectif, sinon le n°1', () => {
    // Rythme 3 : lundi, mercredi, vendredi à partir du lundi 2 novembre ; les 3 premières postées.
    const plan = buildPlan({ productId: 'p1', productName: 'Sérum éclat', rhythm: 3, start: '2026-11-02' });
    plan.items = plan.items.map((i) => (i.n <= 3 ? { ...i, status: 'poste' } : i));
    const plans = [{ id: 'plan1', data: plan }];
    expect(pickChallenge({ day: '2026-11-13', plans, saved: [], top: null })).toMatchObject({
      kind: 'plan',
      text: 'Poste ta vidéo n°6 sur Sérum éclat',
      path: '/app/plan#plan-plan1',
    });
    const late = pickChallenge({ day: '2026-11-12', plans, saved: [], top: null });
    expect(late).toMatchObject({ kind: 'retard', text: 'Rattrape ta vidéo n°4 sur Sérum éclat' });
    expect(late?.detail).toBe('Elle était prévue le 9 novembre (2 vidéos en retard).');
    const saved = [{ product_id: 'p2', name: 'Gourde', videos_posted: 4, video_goal: 20 }];
    expect(pickChallenge({ day: DAY, plans: [], saved, top: null })).toMatchObject({ kind: 'objectif', text: 'Poste ta vidéo n°5 sur Gourde' });
    expect(pickChallenge({ day: DAY, plans: [], saved: [], top: { id: 'p3', name: 'Lampe' } })).toMatchObject({ kind: 'premiere', path: '/app/studio?produit=p3' });
  });

  it('alertes et baisses : seulement celles créées depuis minuit la veille (heure de Paris)', () => {
    const at = (iso: string, type: NotificationData['type'], title: string) => ({
      created_at: iso,
      data: { type, title, body: '', path: '/app', read: false, channels: { push: false, email: false, discord: false } },
    });
    const records = [
      at('2026-11-10T22:00:00Z', 'alerte', 'trop vieille'), // 10 nov. 23 h à Paris
      at('2026-11-10T23:30:00Z', 'alerte', 'hier'), // 11 nov. 0 h 30 à Paris
      at('2026-11-12T03:00:00Z', 'alerte', 'cette nuit'),
      at('2026-11-12T03:00:00Z', 'baisse', 'baisse'),
    ];
    expect(noticesSince(records, 'alerte', DAY).map((n) => n.title)).toEqual(['cette nuit', 'hier']);
    expect(noticesSince(records, 'baisse', DAY).map((n) => n.title)).toEqual(['baisse']);
  });

  it('le récap préparé la nuit contient les alertes, les baisses et le défi ; l’e-mail les montre', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-12T03:00:00Z'), toFake: ['Date'] });
    await member('lea', { plan: 'pro', digest_hour: 9 });
    await repo.saveRecord('lea', 'notification', { type: 'alerte', title: 'Alerte : Sérum à +60 %', body: 'Ta règle « beauté qui explose »', path: '/app/produit/x', read: false, channels: {} });
    await repo.saveRecord('lea', 'notification', { type: 'baisse', title: 'Gourde en baisse', body: '−25 % en 7 jours', path: '/app/produit/y', read: false, channels: {} });
    const plan = buildPlan({ productId: 'p1', productName: 'Sérum éclat', rhythm: 7, start: DAY });
    await repo.saveRecord('lea', 'publication', plan);
    await prepareDigests(DAY, repo);
    const digest = await repo.getDigest('lea', DAY);
    const personal = (digest!.content as PersonalDigestContent).personal!;
    expect(personal.alerts.map((a) => a.title)).toEqual(['Alerte : Sérum à +60 %']);
    expect(personal.drops.map((a) => a.title)).toEqual(['Gourde en baisse']);
    expect(personal.challenge?.text).toBe('Poste ta vidéo n°1 sur Sérum éclat');
    await scheduleDigestEmails(DAY, repo, new Date('2026-11-12T03:00:00Z'));
    const [mail] = await repo.listLocalEmails!(5);
    expect(mail.html).toContain('Défi du jour');
    expect(mail.html).toContain('Poste ta vidéo n°1 sur Sérum éclat');
    expect(mail.html).toContain('Alerte : Sérum à +60 %');
    expect(mail.html).toContain('Produits suivis en baisse');
  });
});

describe('historique des vidéos et série', () => {
  it('une hausse vue la nuit compte pour la veille, de jour pour le jour même ; une correction retire', () => {
    expect(attributionDay(new Date('2026-11-12T03:00:00Z'))).toBe('2026-11-11');
    expect(attributionDay(new Date('2026-11-12T10:00:00Z'))).toBe('2026-11-12');
    let h: VideoHistory = applyObservation(null, [{ product_id: 'a', videos_posted: 2 }], new Date('2026-11-09T10:00:00Z'));
    expect(totalsByDay(h)).toEqual({});
    h = applyObservation(h, [{ product_id: 'a', videos_posted: 3 }], new Date('2026-11-10T03:00:00Z'));
    h = applyObservation(h, [{ product_id: 'a', videos_posted: 5 }], new Date('2026-11-10T18:00:00Z'));
    h = applyObservation(h, [{ product_id: 'a', videos_posted: 6 }], new Date('2026-11-11T19:00:00Z'));
    expect(totalsByDay(h)).toEqual({ '2026-11-09': 1, '2026-11-10': 2, '2026-11-11': 1 });
    h = applyObservation(h, [{ product_id: 'a', videos_posted: 5 }], new Date('2026-11-11T20:00:00Z'));
    expect(totalsByDay(h)).toEqual({ '2026-11-09': 1, '2026-11-10': 2 });
  });

  it('premier relevé : les vidéos « postées » des plans à leur date prévue', () => {
    const plan: PublicationPlan = buildPlan({ productId: 'p', productName: 'P', rhythm: 7, start: '2026-11-08' });
    plan.items = plan.items.map((i) => (i.n <= 3 ? { ...i, status: 'poste' } : i));
    const h = applyObservation(null, [{ product_id: 'p', videos_posted: 3 }], new Date('2026-11-12T10:00:00Z'), [plan]);
    expect(totalsByDay(h)).toEqual({ '2026-11-08': 1, '2026-11-09': 1, '2026-11-10': 1 });
  });

  it('série : jours consécutifs ; aujourd’hui sans vidéo ne la casse pas encore', () => {
    const days = { '2026-11-08': 1, '2026-11-09': 2, '2026-11-10': 1, '2026-11-11': 1, '2026-11-05': 3 };
    expect(currentStreak(days, '2026-11-12')).toBe(4);
    expect(currentStreak({ ...days, '2026-11-12': 1 }, '2026-11-12')).toBe(5);
    expect(currentStreak(days, '2026-11-13')).toBe(0);
    expect(bestStreak(days)).toBe(4);
  });
});

describe('récap du dimanche', () => {
  it('vidéos de la semaine, série, gains saisis de la semaine seulement, meilleur produit', async () => {
    const lea = await member('lea', { plan: 'pro' });
    const [product, other] = await repo.listProducts();
    await repo.saveProduct('lea', product.id);
    await repo.saveProduct('lea', other.id);
    // Lundi : baseline ; mardi, mercredi et jeudi : des vidéos.
    await repo.updateSavedProduct('lea', product.id, { videos_posted: 0 });
    const observe = async (iso: string, a: number, b: number) => {
      await repo.updateSavedProduct('lea', product.id, { videos_posted: a });
      await repo.updateSavedProduct('lea', other.id, { videos_posted: b });
      return buildWeeklyRecap((await repo.getProfile('lea'))!, repo, new Date(iso));
    };
    await observe('2026-11-09T10:00:00Z', 0, 0);
    await observe('2026-11-10T18:00:00Z', 2, 0);
    await observe('2026-11-11T18:00:00Z', 3, 1);
    await repo.saveRecord('lea', 'gain', { date: '2026-11-11', product_name: other.name, product_id: other.id, video: null, amount_cents: 1250, sales: 2, source: 'saisie' });
    await repo.saveRecord('lea', 'gain', { date: '2026-11-02', product_name: product.name, product_id: product.id, video: null, amount_cents: 9900, sales: 9, source: 'saisie' });
    const week = await observe('2026-11-12T18:00:00Z', 4, 1);

    expect(week.week_start).toBe('2026-11-09');
    expect(week.week_end).toBe('2026-11-15');
    expect(week.videos.total).toBe(5);
    expect(week.videos.by_day.map((d) => d.count)).toEqual([0, 2, 2, 1, 0, 0, 0]);
    expect(week.streak.current).toBe(3);
    expect(week.gains).toEqual({ cents: 1250, entries: 1 });
    expect(week.best_product).toMatchObject({ name: other.name, reason: 'gains' });
    expect(week.goals[0]).toMatchObject({ product_id: product.id, posted: 4, goal: 20 });
    expect(lea.plan).toBe('pro');
  });

  it('en Gratuit : pas de gains (fonction Pro), le meilleur produit vient des vidéos', async () => {
    await member('max');
    const [product] = await repo.listProducts();
    await repo.saveProduct('max', product.id);
    await buildWeeklyRecap((await repo.getProfile('max'))!, repo, new Date('2026-11-10T10:00:00Z'));
    await repo.updateSavedProduct('max', product.id, { videos_posted: 2 });
    const week = await buildWeeklyRecap((await repo.getProfile('max'))!, repo, new Date('2026-11-11T10:00:00Z'));
    expect(week.gains).toBeNull();
    expect(week.best_product).toMatchObject({ reason: 'videos', detail: expect.stringMatching(/^2\svidéos postées cette semaine$/) });
  });

  it('tâche horaire : le dimanche à l’heure choisie, une seule fois, sur les canaux choisis', async () => {
    expect(isSunday(SUNDAY)).toBe(true);
    expect(isSunday(DAY)).toBe(false);
    const lea = await member('lea', { plan: 'pro' });
    await member('sans-email', { digest_email: false });
    await saveRecapSettings(lea, { dimanche: { heure: 18, push: true } }, repo);
    const pushes: string[] = [];
    registerPushSender(async (userId, payload) => (pushes.push(`${userId}:${payload.title}`), true));

    expect(await runRecapHourly(new Date('2026-11-15T15:00:00Z'), repo)).toMatchObject({ weekly: 0 }); // 16 h à Paris
    expect(await runRecapHourly(new Date('2026-11-15T17:00:00Z'), repo)).toMatchObject({ weekly: 1 }); // 18 h
    expect(await runRecapHourly(new Date('2026-11-15T18:00:00Z'), repo)).toMatchObject({ weekly: 0 }); // déjà fait
    expect(await runRecapHourly(new Date('2026-11-12T17:00:00Z'), repo)).toMatchObject({ weekly: 0 }); // jeudi

    const mails = (await repo.listLocalEmails!(10)).filter((m) => m.subject.startsWith('Ta semaine'));
    expect(mails.map((m) => m.to)).toEqual(['lea@test.fr']);
    expect(mails[0].html).toContain('Voir ma semaine');
    expect(pushes).toEqual(['lea:Ton récap de la semaine']);
    expect(await repo.listRecords('lea', WEEKLY_RECAP_KIND)).toHaveLength(1);
    expect((await repo.listRecords<NotificationData>('lea', 'notification'))[0].data).toMatchObject({ type: 'recap', channels: { push: true } });
  });

  it('push du récap du matin à l’heure choisie, une fois par jour', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-12T03:00:00Z'), toFake: ['Date'] });
    const lea = await member('lea', { digest_hour: 8 });
    await saveRecapSettings(lea, { matin: { push: true } }, repo);
    await prepareDigests(DAY, repo);
    const pushes: string[] = [];
    registerPushSender(async (_u, payload) => (pushes.push(payload.title), true));
    expect((await runRecapHourly(new Date('2026-11-12T06:00:00Z'), repo)).morningPush).toBe(0); // 7 h
    expect((await runRecapHourly(new Date('2026-11-12T07:00:00Z'), repo)).morningPush).toBe(1); // 8 h
    expect((await runRecapHourly(new Date('2026-11-12T08:00:00Z'), repo)).morningPush).toBe(0);
    expect(pushes).toEqual(['Ton récap du matin est prêt']);
  });
});

describe('réglages et désinscription en un clic', () => {
  it('le dimanche suit le choix e-mail du matin par défaut', async () => {
    const lea = await member('lea');
    const sans = await member('sans', { digest_email: false });
    expect((await getRecapSettings(lea, repo)).dimanche).toEqual({ heure: 18, email: true, discord: false, push: false });
    expect((await getRecapSettings(sans, repo)).dimanche.email).toBe(false);
    await saveRecapSettings(lea, { dimanche: { heure: 3 } }, repo);
    expect((await getRecapSettings(lea, repo)).dimanche.heure).toBe(18); // heure hors liste refusée
  });

  it('un jeton par liste ; les liens déjà envoyés du récap du matin restent valables', () => {
    const legacy = unsubscribeToken('u1');
    expect(verifyUnsubscribeToken('u1', legacy)).toBe(true);
    expect(verifyUnsubscribeToken('u1', legacy, 'dimanche')).toBe(false);
    expect(verifyUnsubscribeToken('u1', unsubscribeToken('u1', 'dimanche'), 'dimanche')).toBe(true);
    expect(unsubscribeUrls('u1', 'https://x.fr').oneClick).not.toContain('&l=');
    expect(unsubscribeUrls('u1', 'https://x.fr', 'dimanche').oneClick).toContain('&l=dimanche');
    expect(unsubscribeHeaders('u1', 'conseils', 'https://x.fr')).toEqual({
      'List-Unsubscribe': `<https://x.fr/api/recap/desinscription?u=u1&t=${unsubscribeToken('u1', 'conseils')}&l=conseils>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('POST en un clic (RFC 8058) : coupe la bonne liste, refuse un jeton d’une autre liste', async () => {
    await member('lea');
    const post = (query: string) => oneClickRoute(new Request(`http://localhost/api/recap/desinscription?${query}`, { method: 'POST' }));
    expect((await post(`u=lea&t=${unsubscribeToken('lea')}&l=dimanche`)).status).toBe(400);
    const ok = await post(`u=lea&t=${unsubscribeToken('lea', 'dimanche')}&l=dimanche`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('');
    const lea = (await repo.getProfile('lea'))!;
    expect((await getRecapSettings(lea, repo)).dimanche.email).toBe(false);
    expect(lea.digest_email).toBe(true); // le matin n'est pas touché
    await applyUnsubscribe('lea', 'conseils', repo);
    expect([...(await getDisabledLifecycle('lea', repo))].sort()).toEqual(['astuce_j1', 'bienvenue', 'rappel_j3', 'reactivation']);
    expect((await post(`u=lea&t=${unsubscribeToken('lea')}`)).status).toBe(200);
    expect((await repo.getProfile('lea'))!.digest_email).toBe(false);
  });
});
