import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { listNotifications } from '@/lib/notify';
import { ensureBoard, getWeeklyGoal, postingStats, saveBoard, setBoardGoal, setWeeklyGoal } from '@/lib/v2/board';
import { alertDecliningProducts, declineReason, findReplacements, salesDrop } from '@/lib/v2/decline';
import { loadMyProducts } from '@/lib/v2/my-products';
import {
  buildPlan,
  monthCalendar,
  moveItem,
  newBoard,
  parseMonth,
  planToIcs,
  postingStreak,
  postedThisWeek,
  resizeBoard,
  safeUrl,
  schedulePlan,
  setPostedDetails,
  shiftMonth,
  unschedulePlan,
} from '@/lib/v2/planning';
import { sendPublicationReminders } from '@/lib/v2/reminders';
import { makeProduct, makeUser } from './v2-fixtures';

let repo: LocalRepo;
beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});
afterEach(() => setRepoForTests(null));

describe('bloc 5.1 · tableau des vidéos (à tourner, tourné, posté)', () => {
  it('crée le tableau d’un produit suivi en reprenant le compteur d’avant', () => {
    const board = newBoard({ productId: 'p', productName: 'Sérum', goal: 20, alreadyPosted: 3 });
    expect(board.items).toHaveLength(20);
    expect(board.items.filter((i) => i.status === 'poste').map((i) => i.n)).toEqual([1, 2, 3]);
    expect(board.rhythm).toBeNull();
  });

  it('déplace une vidéo, date la publication du jour, et tient à jour le compteur de Mes produits', async () => {
    await makeUser(repo, 'u', 'free');
    await repo.upsertProducts([makeProduct({ id: 'p', name: 'Sérum' })]);
    const saved = await repo.saveProduct('u', 'p');
    const record = await ensureBoard(repo, 'u', saved, { id: 'p', name: 'Sérum' });
    expect((await ensureBoard(repo, 'u', saved, { id: 'p', name: 'Sérum' })).id).toBe(record.id);

    const filmed = moveItem(record.data, 1, 'tourne', '2026-11-12');
    expect(filmed.items[0]).toMatchObject({ status: 'tourne', posted_at: null });
    const posted = moveItem(filmed, 1, 'poste', '2026-11-12');
    expect(posted.items[0]).toMatchObject({ status: 'poste', posted_at: '2026-11-12' });
    // Revenir en arrière garde les chiffres saisis.
    expect(moveItem(posted, 1, 'tourne', '2026-11-13').items[0].posted_at).toBe('2026-11-12');

    await saveBoard(repo, 'u', record, posted);
    expect(await repo.getSavedProduct('u', 'p')).toMatchObject({ videos_posted: 1, video_goal: 20 });
  });

  it('change l’objectif sans jamais retirer une vidéo tournée ou postée', async () => {
    let board = newBoard({ productId: 'p', productName: 'S', goal: 5 });
    board = moveItem(board, 5, 'poste', '2026-11-12');
    board = moveItem(board, 4, 'tourne', '2026-11-12');
    expect(resizeBoard(board, 3, '2026-11-12').items.map((i) => i.status)).toEqual(['a_tourner', 'tourne', 'poste']);
    const smaller = resizeBoard(board, 1, '2026-11-12');
    expect(smaller.items.map((i) => i.status)).toEqual(['tourne', 'poste']);
    expect(smaller.items.map((i) => i.n)).toEqual([1, 2]);
    expect(resizeBoard(board, 8, '2026-11-12').items).toHaveLength(8);

    await makeUser(repo, 'u');
    await repo.upsertProducts([makeProduct({ id: 'p' })]);
    const saved = await repo.saveProduct('u', 'p');
    await setBoardGoal(repo, 'u', saved, { id: 'p', name: 'P' }, 25, '2026-11-12');
    expect((await repo.getSavedProduct('u', 'p'))?.video_goal).toBe(25);
  });
});

describe('bloc 5.2 · détails d’une vidéo postée', () => {
  it('garde lien, date, vues et ventes saisis à la main ; refuse un lien qui n’est pas http(s)', () => {
    const board = setPostedDetails(moveItem(newBoard({ productId: 'p', productName: 'S' }), 2, 'poste', '2026-11-12'), 2, {
      url: safeUrl('https://www.tiktok.com/@moi/video/123'),
      posted_at: '2026-11-11',
      views: 12000,
      sales: 14,
    });
    expect(board.items[1]).toMatchObject({ url: 'https://www.tiktok.com/@moi/video/123', posted_at: '2026-11-11', views: 12000, sales: 14 });
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('pas un lien')).toBeNull();
    expect(safeUrl('')).toBeNull();
  });
});

describe('bloc 5.3 · calendrier', () => {
  it('répartit les vidéos pas encore postées selon le rythme ; les postées gardent leur date', () => {
    const board = moveItem(newBoard({ productId: 'p', productName: 'S' }), 1, 'poste', '2026-11-10');
    const plan = schedulePlan(board, 3, '2026-11-16');
    expect(plan.items[0].date).toBeNull();
    expect(plan.items.slice(1, 4).map((i) => i.date)).toEqual(['2026-11-16', '2026-11-18', '2026-11-20']);
    expect(plan.items.filter((i) => i.date)).toHaveLength(19);
    expect(unschedulePlan(plan).items.every((i) => i.date === null)).toBe(true);
    // L'export .ics ne contient que les vidéos datées.
    expect(planToIcs(plan, 'x', 'https://tracktout.com').match(/BEGIN:VEVENT/g)).toHaveLength(19);
  });

  it('vue mensuelle du lundi au dimanche, avec les vidéos de chaque jour', () => {
    const plan = buildPlan({ productId: 'p', productName: 'Sérum', rhythm: 5, start: '2026-11-16' });
    const weeks = monthCalendar('2026-11', [{ id: 'plan-1', data: plan }]);
    expect(weeks[0][0].date).toBe('2026-10-26');
    expect(weeks.at(-1)!.at(-1)!.date).toBe('2026-12-06');
    expect(weeks).toHaveLength(6);
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
    const day = weeks.flat().find((d) => d.date === '2026-11-16')!;
    expect(day.entries).toEqual([{ planId: 'plan-1', productId: 'p', product: 'Sérum', n: 1, total: 20, status: 'a_tourner' }]);
    expect(weeks.flat().find((d) => d.date === '2026-11-21')!.entries).toEqual([]);
    expect(parseMonth('2026-13')).toBeNull();
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('bloc 5.4 · rappels par notify', () => {
  it('rappel une fois par jour, à l’heure du récap, Pro seulement, sur les canaux choisis', async () => {
    await makeUser(repo, 'pro', 'pro', { digest_hour: 9 });
    await makeUser(repo, 'gratuit', 'free', { digest_hour: 9 });
    for (const id of ['pro', 'gratuit']) await repo.saveRecord(id, 'publication', buildPlan({ productId: 'p', productName: 'Sérum', rhythm: 7, start: '2026-11-12' }));
    // 7 h à Paris : trop tôt.
    expect(await sendPublicationReminders('2026-11-12', repo, new Date('2026-11-12T06:00:00Z'))).toBe(0);
    expect(await sendPublicationReminders('2026-11-12', repo, new Date('2026-11-12T08:30:00Z'))).toBe(1);
    expect(await sendPublicationReminders('2026-11-12', repo, new Date('2026-11-12T09:30:00Z'))).toBe(0);
    const [notification] = await listNotifications('pro', repo);
    // Récap du matin par e-mail actif (par défaut) : il porte déjà le défi du jour, donc pas de second e-mail.
    expect(notification.data).toMatchObject({ type: 'rappel', title: 'Aujourd’hui : ta vidéo n°1 sur Sérum', path: '/app/plan', channels: { email: false } });
    expect(await listNotifications('gratuit', repo)).toHaveLength(0);
    // Sans récap e-mail, le rappel part par e-mail.
    await makeUser(repo, 'sans-recap', 'pro', { digest_hour: 9, digest_email: false });
    await repo.saveRecord('sans-recap', 'publication', buildPlan({ productId: 'p', productName: 'Sérum', rhythm: 7, start: '2026-11-12' }));
    await sendPublicationReminders('2026-11-12', repo, new Date('2026-11-12T08:30:00Z'));
    expect((await listNotifications('sans-recap', repo))[0].data.channels).toMatchObject({ email: true });
  });
});

describe('bloc 5.5 · série et objectif hebdomadaire', () => {
  it('compte les jours consécutifs avec au moins une vidéo, la journée en cours ne casse pas la série', () => {
    const dates = ['2026-11-09', '2026-11-10', '2026-11-10', '2026-11-11'];
    expect(postingStreak(dates, '2026-11-11')).toBe(3);
    expect(postingStreak(dates, '2026-11-12')).toBe(3);
    expect(postingStreak(dates, '2026-11-13')).toBe(0);
    expect(postingStreak([], '2026-11-12')).toBe(0);
    // Semaine du lundi 9 au dimanche 15.
    expect(postedThisWeek([...dates, '2026-11-08', '2026-11-16'], '2026-11-12')).toBe(4);
  });

  it('objectif hebdomadaire réglable (1 à 50, 5 par défaut) et statistiques de publication', async () => {
    await makeUser(repo, 'u');
    expect((await getWeeklyGoal(repo, 'u')).weekly).toBe(5);
    await setWeeklyGoal(repo, 'u', 7);
    await setWeeklyGoal(repo, 'u', 900);
    expect((await getWeeklyGoal(repo, 'u')).weekly).toBe(50);
    expect(await repo.listRecords('u', 'objectif_videos')).toHaveLength(1);
    const board = moveItem(moveItem(newBoard({ productId: 'p', productName: 'S' }), 1, 'poste', '2026-11-11'), 2, 'poste', '2026-11-12');
    expect(postingStats([board], 7, '2026-11-12')).toEqual({ streak: 2, thisWeek: 2, weeklyGoal: 7, totalPosted: 2, postedToday: true });
  });
});

describe('bloc 5.6 · alerte quand un produit suivi baisse', () => {
  const growing = Array.from({ length: 14 }, () => 10);
  const falling = [...Array.from({ length: 7 }, () => 10), ...Array.from({ length: 7 }, () => 5)];

  it('repère la tendance « baisse », la croissance mesurée ≤ −15 % ou la chute des ventes', () => {
    expect(salesDrop(falling)).toBeCloseTo(-0.5);
    expect(salesDrop(falling.slice(1))).toBeNull();
    expect(declineReason(makeProduct({ id: 'a', trend: 'baisse' }))).toBe('tendance');
    expect(declineReason(makeProduct({ id: 'b', trend: 'stable', growth_7d: -0.18 }))).toBe('croissance');
    expect(declineReason(makeProduct({ id: 'c', trend: 'stable', growth_7d: -0.18, latest_breakdown: null }))).toBeNull();
    expect(declineReason(makeProduct({ id: 'd', trend: 'stable', growth_7d: 0, sales_30d: falling }))).toBe('ventes');
    expect(declineReason(makeProduct({ id: 'e', sales_30d: growing }))).toBeNull();
  });

  it('propose des remplaçants : même niche, meilleur score, qui ne baissent pas, pas déjà suivis', () => {
    const product = makeProduct({ id: 'p', niche: 'beaute', latest_score: 40 });
    const catalog = [
      makeProduct({ id: 'r1', niche: 'beaute', latest_score: 80 }),
      makeProduct({ id: 'r2', niche: 'beaute', latest_score: 60 }),
      makeProduct({ id: 'baisse', niche: 'beaute', latest_score: 90, trend: 'baisse' }),
      makeProduct({ id: 'maison', niche: 'maison', latest_score: 95 }),
      makeProduct({ id: 'moins', niche: 'beaute', latest_score: 30 }),
      makeProduct({ id: 'suivi', niche: 'beaute', latest_score: 85 }),
    ];
    expect(findReplacements(product, catalog, new Set(['suivi'])).map((p) => p.id)).toEqual(['r1', 'r2']);
  });

  it('tâche nocturne : une notification « baisse » par produit, remplaçants nommés en Pro, pas de relance avant 14 jours', async () => {
    await makeUser(repo, 'pro', 'pro');
    await makeUser(repo, 'gratuit', 'free');
    await repo.upsertProducts([
      makeProduct({ id: 'p', name: 'Sérum en baisse', trend: 'baisse', growth_7d: -0.3, latest_score: 40 }),
      makeProduct({ id: 'r1', name: 'Crème qui monte', latest_score: 75 }),
      makeProduct({ id: 'ok', name: 'Gourde', niche: 'maison', latest_score: 60 }),
    ]);
    for (const id of ['pro', 'gratuit']) {
      await repo.saveProduct(id, 'p');
      await repo.saveProduct(id, 'ok');
    }
    const now = new Date('2026-11-12T03:30:00Z');
    expect(await alertDecliningProducts('2026-11-12', repo, now)).toEqual({ alerts: 2, checked: 4 });
    const [pro] = await listNotifications('pro', repo);
    expect(pro.data).toMatchObject({ type: 'baisse', title: 'Sérum en baisse commence à baisser', path: '/app/mes-produits/p' });
    expect(pro.data.body).toContain('Crème qui monte (score 75)');
    const [free] = await listNotifications('gratuit', repo);
    expect(free.data.body).not.toContain('Crème qui monte');
    expect(free.data.body).toContain('Ouvre le radar');
    // Le lendemain et dans 13 jours : rien. Dans 14 jours : nouvelle alerte si ça baisse toujours.
    expect((await alertDecliningProducts('2026-11-13', repo, now)).alerts).toBe(0);
    expect((await alertDecliningProducts('2026-11-25', repo, now)).alerts).toBe(0);
    await repo.upsertProducts([makeProduct({ id: 'p', name: 'Sérum en baisse', trend: 'baisse', snapshot_date: '2026-11-26', latest_score: 40 })]);
    expect((await alertDecliningProducts('2026-11-26', repo, new Date('2026-11-26T03:30:00Z'))).alerts).toBe(2);
  });

  it('Mes produits : tableaux créés à la demande, baisses et remplaçants pour les plans payants', async () => {
    const profile = await makeUser(repo, 'u', 'pro');
    await repo.upsertProducts([
      makeProduct({ id: 'p', trend: 'baisse', latest_score: 40 }),
      makeProduct({ id: 'r1', latest_score: 75 }),
    ]);
    await repo.saveProduct('u', 'p');
    await repo.updateSavedProduct('u', 'p', { videos_posted: 2 });
    const { rows, stats } = await loadMyProducts(repo, profile, '2026-11-12', new Date('2026-11-12T08:00:00Z'));
    expect(rows[0]).toMatchObject({ declining: true });
    expect(rows[0].replacements.map((r) => r.id)).toEqual(['r1']);
    expect(stats.totalPosted).toBe(2);
    expect(await repo.listRecords('u', 'publication')).toHaveLength(1);
  });
});
