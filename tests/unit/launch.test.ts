import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepo } from '@/lib/db/local';
import { ensureBoard, saveBoard } from '@/lib/v2/board';
import { completeStep, effectiveDone, launchAdvice, launchProgress, newLaunch, nextStep, previousStep, statusFromLaunch } from '@/lib/v2/launch';
import { closeLaunch, currentStage, launchForProduct, setProductStage, startLaunch, syncLaunchStage } from '@/lib/v2/launch-store';
import { shouldAdvance } from '@/lib/v2/manager';
import { moveItem, newBoard } from '@/lib/v2/planning';
import { makeProduct, makeUser } from './v2-fixtures';

const TODAY = '2026-11-14';
let repo: LocalRepo;

beforeEach(async () => {
  repo = new LocalRepo(null);
  await repo.upsertProducts([makeProduct({ id: 'p1', name: 'Sérum éclat vitamine C 30 ml' }), makeProduct({ id: 'p2' }), makeProduct({ id: 'p3' })]);
});

describe('lancement · étapes', () => {
  it('commence à l’échantillon (produit choisi), avance, revient en arrière sans rien perdre', () => {
    const launch = newLaunch({ id: 'p1', name: 'Sérum éclat vitamine C 30 ml' }, TODAY);
    expect(launch.step).toBe('echantillon');
    expect(launch.done).toEqual(['produit']);
    const after = completeStep(launch, 'echantillon');
    expect(after.step).toBe('scripts');
    expect(after.done).toEqual(['produit', 'echantillon']);
    expect(nextStep('resultats')).toBe('resultats');
    expect(previousStep('produit')).toBe('produit');
    expect(launchProgress(after, null)).toBe(29);
  });

  it('les vidéos cochent tournage et publication même faites depuis le dashboard', () => {
    const launch = newLaunch({ id: 'p1', name: 'P' }, TODAY);
    let board = newBoard({ productId: 'p1', productName: 'P' });
    board = moveItem(board, 1, 'tourne', TODAY);
    expect(effectiveDone(launch, board)).toEqual(['produit', 'tourner']);
    board = moveItem(board, 1, 'poste', TODAY);
    expect(effectiveDone(launch, board)).toEqual(['produit', 'tourner', 'publier']);
    expect(statusFromLaunch(launch, board)).toBe('en_ligne');
  });

  it('statut justifié par le lancement, du plus avancé au moins avancé', () => {
    const launch = newLaunch({ id: 'p1', name: 'P' }, TODAY);
    expect(statusFromLaunch(launch, null)).toBeNull();
    expect(statusFromLaunch({ ...launch, sample: 'demande' }, null)).toBe('echantillon_demande');
    expect(statusFromLaunch({ ...launch, sample: 'recu' }, null)).toBe('echantillon_recu');
    const scripts = completeStep({ ...launch, kept: [{ doc_id: 'd', script: 0, title: 'T' }] }, 'scripts');
    expect(statusFromLaunch(scripts, null)).toBe('scripts_prets');
    expect(statusFromLaunch({ ...launch, state: 'termine' }, null)).toBe('termine');
    expect(statusFromLaunch({ ...launch, state: 'abandonne' }, null)).toBe('arrete');
  });

  it('conseil sans promesse : publier, continuer, ou changer de produit après 6 vidéos sans vente', () => {
    expect(launchAdvice({ posted: 0, goal: 20, sales: 0 }).title).toBe('Publie ta première vidéo');
    expect(launchAdvice({ posted: 3, goal: 20, sales: 0 }).title).toBe('Continue à poster');
    expect(launchAdvice({ posted: 4, goal: 20, sales: 2 }).text).toContain('Encore 16 vidéos');
    expect(launchAdvice({ posted: 6, goal: 20, sales: 0 }).tone).toBe('warn');
    for (const posted of [0, 3, 6, 20]) expect(launchAdvice({ posted, goal: 20, sales: posted % 2 }).text).not.toMatch(/€|gagner|garanti/i);
  });

  it('avance seulement vers l’avant, jamais sur un produit terminé ou abandonné', () => {
    expect(shouldAdvance('a_lancer', 'echantillon_demande')).toBe(true);
    expect(shouldAdvance('en_tournage', 'echantillon_recu')).toBe(false);
    expect(shouldAdvance('termine', 'en_ligne')).toBe(false);
    expect(shouldAdvance('arrete', 'echantillon_demande')).toBe(false);
  });
});

describe('lancement · base', () => {
  it('lancer un produit le suit, et reprend le même lancement au second clic', async () => {
    const user = await makeUser(repo, 'u1', 'starter');
    const first = await startLaunch(repo, user, 'p1', TODAY);
    expect(first.ok && first.created).toBe(true);
    expect(await repo.getSavedProduct('u1', 'p1')).not.toBeNull();
    const again = await startLaunch(repo, user, 'p1', TODAY);
    expect(again.ok && !again.created && again.launch.id === (first.ok ? first.launch.id : '')).toBe(true);
    expect((await startLaunch(repo, user, 'inconnu', TODAY)).ok).toBe(false);
  });

  it('respecte la limite de produits suivis du plan (côté serveur)', async () => {
    const user = await makeUser(repo, 'u2', 'starter');
    for (let i = 0; i < 10; i++) await repo.saveProduct('u2', `x${i}`);
    expect(await startLaunch(repo, user, 'p1', TODAY)).toEqual({ ok: false, reason: 'limite' });
  });

  it('le statut suit le parcours tout seul, et se corrige à la main', async () => {
    const user = await makeUser(repo, 'u3');
    const started = await startLaunch(repo, user, 'p1', TODAY);
    if (!started.ok) throw new Error('lancement');
    expect(await currentStage(repo, 'u3', 'p1')).toBe('a_lancer');
    await syncLaunchStage(repo, 'u3', { ...started.launch.data, sample: 'demande' }, null, TODAY);
    expect(await currentStage(repo, 'u3', 'p1')).toBe('echantillon_demande');
    // Une étape plus ancienne ne fait pas reculer.
    await setProductStage(repo, 'u3', 'p1', 'en_tournage', 'manuel', TODAY);
    await syncLaunchStage(repo, 'u3', { ...started.launch.data, sample: 'recu' }, null, TODAY);
    expect(await currentStage(repo, 'u3', 'p1')).toBe('en_tournage');
    // Vidéo en ligne depuis le tableau : « En ligne ».
    const saved = (await repo.getSavedProduct('u3', 'p1'))!;
    const board = await ensureBoard(repo, 'u3', saved, { id: 'p1', name: 'P' });
    const posted = moveItem(board.data, 1, 'poste', TODAY);
    await saveBoard(repo, 'u3', board, posted);
    await syncLaunchStage(repo, 'u3', started.launch.data, posted, TODAY);
    expect(await currentStage(repo, 'u3', 'p1')).toBe('en_ligne');
  });

  it('« Terminé » à la main ferme le lancement ; un autre statut le rouvre ; terminer depuis le parcours aussi', async () => {
    const user = await makeUser(repo, 'u4');
    const started = await startLaunch(repo, user, 'p2', TODAY);
    if (!started.ok) throw new Error('lancement');
    await setProductStage(repo, 'u4', 'p2', 'termine', 'manuel', TODAY);
    expect((await launchForProduct(repo, 'u4', 'p2'))?.data.state).toBe('termine');
    await setProductStage(repo, 'u4', 'p2', 'en_ligne', 'manuel', TODAY);
    expect((await launchForProduct(repo, 'u4', 'p2'))?.data.state).toBe('en_cours');
    const record = (await launchForProduct(repo, 'u4', 'p2'))!;
    await closeLaunch(repo, 'u4', record, 'abandonne', TODAY);
    expect(await currentStage(repo, 'u4', 'p2')).toBe('arrete');
    expect((await launchForProduct(repo, 'u4', 'p2'))?.data.state).toBe('abandonne');
    // Relancer un produit abandonné : nouveau lancement, statut « À lancer ».
    const again = await startLaunch(repo, user, 'p2', TODAY);
    expect(again.ok && again.created).toBe(true);
    expect(await currentStage(repo, 'u4', 'p2')).toBe('a_lancer');
  });
});

describe('lancement · lien de la vidéo publiée', () => {
  it('lit un lien complet sans appel extérieur en mode local ; refuse le reste avec la bonne raison', async () => {
    const { checkPublishedLink } = await import('@/lib/v2/launch-publish');
    const ok = await checkPublishedLink('https://www.tiktok.com/@labras3/video/7685364570164088097?lang=fr', { repo, userId: 'u', offline: true });
    expect(ok).toMatchObject({ ok: true, views: null, sales: null });
    expect(ok.ok && ok.link.id).toBe('7685364570164088097');
    expect(await checkPublishedLink('https://example.com/video/1', { repo, userId: 'u', offline: true })).toEqual({ ok: false, reason: 'lien' });
    expect(await checkPublishedLink('https://vm.tiktok.com/ZMabc123/', { repo, userId: 'u', offline: true })).toEqual({ ok: false, reason: 'court' });
  });

  it('déplacer une vidéo dans le calendrier : jamais avant aujourd’hui, jamais une vidéo en ligne', async () => {
    const { moveItemDate, moveItem: move } = await import('@/lib/v2/planning');
    let board = newBoard({ productId: 'p', productName: 'P' });
    board = move(board, 2, 'poste', TODAY);
    expect(moveItemDate(board, 1, '2026-11-20', TODAY).items[0].date).toBe('2026-11-20');
    expect(moveItemDate(board, 1, '2026-11-01', TODAY)).toBe(board);
    expect(moveItemDate(board, 2, '2026-11-20', TODAY).items[1].date).toBeNull();
  });
});
