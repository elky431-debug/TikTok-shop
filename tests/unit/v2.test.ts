import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askStructured, setStructuredRunnerForTests } from '@/lib/ai/structured';
import { selectLiveCatalog } from '@/lib/catalog';
import { mapNexscopeVideoFacts, nexscopeId, sourceProductId } from '@/lib/data/nexscope';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import type { PlanId, Product } from '@/lib/db/types';
import {
  cheapestPlanWith,
  getPlan,
  isPlanId,
  isUnlimited,
  PAID_PLANS,
  parsePaidPlan,
  planRank,
  quotaReachedMessage,
  RECOMMENDED_PLAN,
  remainingLabel,
  SAFETY_CAPS,
  yearlySavings,
  type PlanLimits,
} from '@/lib/plans';
import { enabledRegions, regionFor } from '@/lib/regions';
import { simulateAnalysis, tiktokVideoId, AnalysisSchema } from '@/lib/v2/analysis';
import { earningsDashboard, parseAmount, parseEarningsCsv, weekStart } from '@/lib/v2/earnings';
import { OfferExtractionSchema, scoreOffer, simulateExtraction, type OfferExtraction } from '@/lib/v2/offers';
import { buildPlan, dueOn, planToIcs } from '@/lib/v2/planning';
import { remainingThisMonth, remainingToday } from '@/lib/v2/quota';
import { schedulePublicationEmails } from '@/lib/v2/reminders';

let repo: LocalRepo;
beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});
afterEach(() => {
  setRepoForTests(null);
  setStructuredRunnerForTests(null);
  vi.unstubAllEnvs();
});

describe('plans : fonctions V2 et quotas côté serveur', () => {
  it('plan de publication dès Starter ; gains, analyses et propositions (par mois) dès Pro ; Europe en Elite', () => {
    expect(getPlan('aucun')).toMatchObject({ access: false, earnings: false, planning: false, offersPerMonth: 0, analysesPerMonth: 0, europe: false });
    expect(getPlan('starter')).toMatchObject({ access: true, earnings: false, planning: true, offersPerMonth: 0, analysesPerMonth: 0, europe: false });
    expect(getPlan('pro')).toMatchObject({ earnings: true, planning: true, offersPerMonth: 20, analysesPerMonth: 20, europe: false });
    expect(getPlan('elite')).toMatchObject({
      earnings: true,
      planning: true,
      offersPerMonth: SAFETY_CAPS.offersPerMonth,
      analysesPerMonth: SAFETY_CAPS.analysesPerMonth,
      europe: true,
    });
    // Elite « illimité » : le plafond existe côté serveur mais n'est jamais affiché.
    expect(isUnlimited('elite', 'analysesPerMonth')).toBe(true);
    expect(isUnlimited('elite', 'offersPerMonth')).toBe(true);
    expect(isUnlimited('pro', 'analysesPerMonth')).toBe(false);
  });

  it('quota mensuel : les fiches comptent depuis le 1er du mois à minuit, heure de Paris', async () => {
    await repo.ensureProfile({ id: 'u', email: 'u@test.fr' });
    const saveAt = async (iso: string) => {
      vi.useFakeTimers({ now: new Date(iso), toFake: ['Date'] });
      try {
        await repo.saveRecord('u', 'analyse', {});
      } finally {
        vi.useRealTimers();
      }
    };
    await saveAt('2026-10-31T22:30:00Z'); // 31 octobre, 23 h 30 à Paris : mois précédent
    await saveAt('2026-10-31T23:30:00Z'); // 1er novembre, 0 h 30 à Paris : compte
    await saveAt('2026-11-02T09:00:00Z'); // un autre jour du mois : compte aussi (pas un quota du jour)
    const now = new Date('2026-11-13T10:00:00Z');
    expect(await remainingThisMonth('u', 'analyse', 20, now)).toBe(18);
    expect(await remainingToday('u', 'analyse', 20, now)).toBe(20);
    expect(await remainingThisMonth('u', 'offre', 20, now)).toBe(20);
    expect(await remainingThisMonth('u', 'analyse', 2, now)).toBe(0);
    expect(await remainingThisMonth('u', 'analyse', 0, now)).toBe(0);
    // Le 1er décembre à 0 h 30 à Paris : le compteur est reparti.
    expect(await remainingThisMonth('u', 'analyse', 20, new Date('2026-11-30T23:30:00Z'))).toBe(20);
    // Le 30 novembre à 23 h 30 à Paris : encore novembre.
    expect(await remainingThisMonth('u', 'analyse', 20, new Date('2026-11-30T22:30:00Z'))).toBe(18);
  });

  it('compte les fiches du jour (heure de Paris) pour le quota', async () => {
    await repo.ensureProfile({ id: 'u', email: 'u@test.fr' });
    expect(await remainingToday('u', 'offre', 2)).toBe(2);
    await repo.saveRecord('u', 'offre', {});
    await repo.saveRecord('u', 'offre', {});
    expect(await remainingToday('u', 'offre', 2)).toBe(0);
    expect(await remainingToday('u', 'analyse', 2)).toBe(2);
    expect(await remainingToday('u', 'offre', 0)).toBe(0);
  });

  it('les fiches restent privées : un autre utilisateur ne peut ni les lire ni les modifier', async () => {
    const mine = await repo.saveRecord('a', 'gain', { x: 1 });
    expect(await repo.getRecord('b', mine.id)).toBeNull();
    const other = await repo.saveRecord('b', 'gain', { x: 2 }, mine.id);
    expect(other.id).not.toBe(mine.id);
    expect((await repo.getRecord<{ x: number }>('a', mine.id))?.data.x).toBe(1);
    await repo.deleteRecord('b', mine.id);
    expect(await repo.listRecords('a', 'gain')).toHaveLength(1);
  });
});

describe('plans : grille du 13 novembre (lib/plans.ts)', () => {
  const PAID = ['starter', 'pro', 'elite'] as const;
  const limits = (key: keyof PlanLimits) => PAID.map((id) => getPlan(id)[key]);

  it('trois plans payants, Pro recommandé ; annuel = 10 mois (2 mois offerts)', () => {
    expect(PAID_PLANS).toEqual(['starter', 'pro', 'elite']);
    expect(RECOMMENDED_PLAN).toBe('pro');
    expect(limits('prices')).toEqual([
      { month: 3499, year: 34990 },
      { month: 5999, year: 59990 },
      { month: 9999, year: 99990 },
    ]);
    for (const id of PAID) {
      expect(getPlan(id).prices.year).toBe(getPlan(id).prices.month * 10);
      expect(yearlySavings(id)).toBe(getPlan(id).prices.month * 2);
    }
  });

  it('sans abonnement (« aucun », ou plan inconnu) : aucun accès, chaque limite à 0 ou fermée', () => {
    const none = getPlan('aucun');
    expect(none.access).toBe(false);
    expect(none.unlimited).toEqual([]);
    expect(none.prices).toEqual({ month: 0, year: 0 });
    for (const [key, value] of Object.entries(none)) {
      if (['id', 'name', 'unlimited', 'prices'].includes(key)) continue;
      expect(value === 0 || value === false, key).toBe(true);
    }
    expect(getPlan(null).id).toBe('aucun');
    expect(getPlan(undefined).id).toBe('aucun');
    expect(getPlan('free' as PlanId).id).toBe('aucun');
  });

  it('tous les plans payants : appli, radar complet avec score, récap e-mail et Discord', () => {
    expect(limits('access')).toEqual([true, true, true]);
    expect(limits('visibleProducts')).toEqual([Infinity, Infinity, Infinity]);
    expect(limits('showScore')).toEqual([true, true, true]);
    expect(limits('emailDigest')).toEqual([true, true, true]);
    expect(limits('discordDigest')).toEqual([true, true, true]);
    expect(limits('planning')).toEqual([true, true, true]);
    expect(limits('preparation')).toEqual([true, true, true]);
  });

  it('quotas de Starter, Pro, Elite (Elite = plafonds de sécurité)', () => {
    expect(limits('scriptsPerDay')).toEqual([10, 40, SAFETY_CAPS.scriptsPerDay]);
    expect(limits('scriptFormats')).toEqual([5, 8, 8]);
    expect(limits('savedProducts')).toEqual([10, SAFETY_CAPS.savedProducts, SAFETY_CAPS.savedProducts]);
    expect(limits('alerts')).toEqual([3, 15, SAFETY_CAPS.alerts]);
    expect(limits('keywordSearchesPerDay')).toEqual([3, 15, 50]);
    expect(limits('analysesPerMonth')).toEqual([0, 20, SAFETY_CAPS.analysesPerMonth]);
    expect(limits('offersPerMonth')).toEqual([0, 20, SAFETY_CAPS.offersPerMonth]);
    expect(limits('anglesSeriesPerDay')).toEqual([0, 3, SAFETY_CAPS.anglesSeriesPerDay]);
    expect(limits('hookAnalysesPerDay')).toEqual([0, 10, SAFETY_CAPS.hookAnalysesPerDay]);
    expect(limits('discordCommandsPerDay')).toEqual([10, 40, SAFETY_CAPS.discordCommandsPerDay]);
    expect(limits('editsPerGeneration')).toEqual([10, 20, SAFETY_CAPS.editsPerGeneration]);
    expect(limits('styleAnalysesPerDay')).toEqual([0, 5, SAFETY_CAPS.styleAnalysesPerDay]);
    for (const key of ['compare', 'earnings', 'personalScore', 'personalStyle', 'weeklyDigest'] as const) {
      expect(limits(key), key).toEqual([false, true, true]);
    }
    for (const key of ['europe', 'scriptTranslation', 'customWeights', 'radarExport', 'export'] as const) {
      expect(limits(key), key).toEqual([false, false, true]);
    }
    // Chaque quota « illimité » d'Elite est exactement son plafond de sécurité.
    for (const key of getPlan('elite').unlimited) expect(getPlan('elite')[key], key).toBe(SAFETY_CAPS[key]);
  });

  it('lit un plan payant (« proplus » de l’ancienne grille = Elite), et les range', () => {
    expect(parsePaidPlan('starter')).toBe('starter');
    expect(parsePaidPlan('elite')).toBe('elite');
    expect(parsePaidPlan('proplus')).toBe('elite');
    for (const bad of ['aucun', 'free', 'PRO', '', null, undefined, 3]) expect(parsePaidPlan(bad)).toBeNull();
    expect(isPlanId('aucun')).toBe(true);
    expect(isPlanId('free')).toBe(false);
    expect(isPlanId('proplus')).toBe(false);
    expect([null, 'aucun', 'starter', 'pro', 'elite'].map((p) => planRank(p as PlanId | null))).toEqual([0, 0, 1, 2, 3]);
  });

  it('le moins cher des plans qui offre une fonction', () => {
    expect(cheapestPlanWith((p) => p.planning).id).toBe('starter');
    expect(cheapestPlanWith((p) => p.compare).id).toBe('pro');
    expect(cheapestPlanWith((p) => p.europe).id).toBe('elite');
    expect(cheapestPlanWith((p) => p.scriptFormats > 5).id).toBe('pro');
    expect(cheapestPlanWith(() => false).id).toBe('elite');
  });

  it('« illimité » ne montre jamais le plafond de sécurité ni ce qu’il en reste', () => {
    const noun = { one: 'analyse', many: 'analyses', feminine: true };
    for (const key of getPlan('elite').unlimited) {
      expect(isUnlimited('elite', key)).toBe(true);
      const cap = String(SAFETY_CAPS[key]);
      for (const left of [SAFETY_CAPS[key], SAFETY_CAPS[key] - 1, 1, 0]) {
        const label = remainingLabel('elite', key, left, noun, 'aujourd’hui');
        expect(label).not.toMatch(/\d/);
        expect(label).toMatch(/illimitées\.$/);
      }
      expect(quotaReachedMessage('elite', key, 'analyses', 'du jour')).not.toContain(cap);
      expect(quotaReachedMessage('elite', key, 'analyses', 'du mois')).toBe('Limite de sécurité du mois atteinte. Le compteur repart le 1er du mois.');
    }
    // Pro : produits suivis « illimités » aussi.
    expect(isUnlimited('pro', 'savedProducts')).toBe(true);
    expect(remainingLabel('pro', 'savedProducts', 499, { one: 'produit', many: 'produits' }, 'aujourd’hui')).toBe('Produits illimités.');
    expect(isUnlimited('pro', 'analysesPerMonth')).toBe(false);
    expect(isUnlimited('aucun', 'scriptsPerDay')).toBe(false);
    expect(isUnlimited(null, 'scriptsPerDay')).toBe(false);
  });

  it('quota fini : ce qu’il reste en clair, et le plan qui va plus loin une fois épuisé', () => {
    const noun = { one: 'analyse', many: 'analyses', feminine: true };
    expect(remainingLabel('pro', 'analysesPerMonth', 12, noun, 'ce mois-ci')).toBe('12 analyses restantes ce mois-ci.');
    expect(remainingLabel('pro', 'analysesPerMonth', 1, noun, 'ce mois-ci')).toBe('1 analyse restante ce mois-ci.');
    expect(remainingLabel('starter', 'scriptsPerDay', 4, { one: 'script', many: 'scripts' }, 'aujourd’hui')).toBe('4 scripts restants aujourd’hui.');
    expect(quotaReachedMessage('starter', 'scriptsPerDay', 'scripts', 'du jour')).toBe(
      'Tu as utilisé tes scripts du jour. Pro va plus loin. Le compteur repart à minuit.',
    );
    expect(quotaReachedMessage('pro', 'analysesPerMonth', 'analyses de vidéo', 'du mois')).toBe(
      'Tu as utilisé tes analyses de vidéo du mois. Elite va plus loin. Le compteur repart le 1er du mois.',
    );
  });
});

describe('suivi des gains', () => {
  it('lit un CSV français (séparateur ;, virgule décimale, dates jj/mm/aaaa) et signale les lignes illisibles', () => {
    const csv = '﻿Date;Produit;Vidéo;Commission;Ventes\n12/11/2026;Sérum éclat;Vidéo 1;12,50 €;3\n13/11/2026;Sérum éclat;Vidéo 2;1 234,5;10\nhier;Gourde;;5;1';
    const result = parseEarningsCsv(csv);
    expect(result.rows).toEqual([
      { date: '2026-11-12', product_name: 'Sérum éclat', product_id: null, video: 'Vidéo 1', amount_cents: 1250, sales: 3, source: 'import' },
      { date: '2026-11-13', product_name: 'Sérum éclat', product_id: null, video: 'Vidéo 2', amount_cents: 123450, sales: 10, source: 'import' },
    ]);
    expect(result.errors).toEqual(['Ligne 4 ignorée : date illisible.']);
    expect(parseEarningsCsv('a,b\n1,2').errors[0]).toMatch(/Colonnes introuvables : date, produit, montant/);
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('abc')).toBeNull();
  });

  it('tableau de bord : par produit, par vidéo, par semaine, produit le plus rentable', () => {
    const e = (date: string, product: string, cents: number, video: string | null) => ({
      date, product_name: product, product_id: null, video, amount_cents: cents, sales: 1, source: 'saisie' as const,
    });
    const board = earningsDashboard([e('2026-11-10', 'Sérum', 1000, 'v1'), e('2026-11-12', 'Sérum', 500, 'v2'), e('2026-11-03', 'Gourde', 800, null)], '2026-11-12');
    expect(board.totalCents).toBe(2300);
    expect(board.monthCents).toBe(2300);
    expect(board.bestProduct).toEqual({ name: 'Sérum', cents: 1500 });
    expect(board.byProduct[0]).toEqual({ name: 'Sérum', cents: 1500, sales: 2, videos: 2 });
    expect(board.byVideo.map((v) => v.video)).toEqual(['v1', 'v2']);
    expect(board.byWeek).toHaveLength(8);
    expect(board.byWeek.at(-1)).toEqual({ start: '2026-11-09', cents: 1500 });
    expect(weekStart('2026-11-15')).toBe('2026-11-09');
  });
});

describe('propositions de marques', () => {
  const radar = [0.05, 0.1, 0.12, 0.15, 0.2].map((r) => ({ niche: 'beaute' as const, commission_rate: r }));
  const offer = (o: Partial<OfferExtraction>): OfferExtraction => ({
    brand: 'Lumi', product: 'Sérum', niche: 'beaute', commission_percent: 10, fixed_fee_euros: null, free_sample: true,
    sample_refundable: null, exclusivity: null, deadline_days: null, conditions: [], ...o,
  });

  it('note la commission face au radar de la niche et chiffre la contre-proposition', () => {
    const low = scoreOffer(offer({}), radar);
    expect(low.nicheMedianPercent).toBe(12);
    expect(low.counterPercent).toBe(15);
    expect(low.reasons[0]).toMatchObject({ tone: 'rose', text: expect.stringContaining('sous la médiane') });
    const high = scoreOffer(offer({ commission_percent: 25 }), radar);
    expect(high.counterPercent).toBeNull();
    expect(high.score).toBeGreaterThan(low.score);
  });

  it('repère exclusivité, délai court et échantillon remboursable', () => {
    const risky = scoreOffer(offer({ exclusivity: true, deadline_days: 3, free_sample: true, sample_refundable: true }), radar);
    const texts = risky.reasons.map((r) => r.text).join(' ');
    expect(texts).toMatch(/Exclusivité/);
    expect(texts).toMatch(/Délai court \(3 jours\)/);
    expect(texts).toMatch(/remboursable/);
    expect(risky.score).toBeLessThan(scoreOffer(offer({}), radar).score);
  });

  it('sans clé d’IA : lecture simulée, conforme au schéma', async () => {
    const result = await askStructured({
      name: 't', schema: OfferExtractionSchema, system: '', prompt: '',
      simulate: () => simulateExtraction('Bonjour, la marque Lumi vous propose 12 % de commission, échantillon offert, publication sous 5 jours, exclusivité.'),
    });
    expect(result.simulated).toBe(true);
    expect(result.data).toMatchObject({ brand: 'Lumi', commission_percent: 12, free_sample: true, exclusivity: true, deadline_days: 5 });
  });

  it('avec un fournisseur : un nouvel essai si la sortie est invalide, puis une erreur claire', async () => {
    let calls = 0;
    setStructuredRunnerForTests(async () => (++calls === 1 ? ({ brand: 3 } as never) : (simulateExtraction('12 %') as never)));
    const ok = await askStructured({ name: 't', schema: OfferExtractionSchema, system: '', prompt: '', simulate: () => simulateExtraction('') });
    expect(calls).toBe(2);
    expect(ok).toMatchObject({ simulated: false, data: { commission_percent: 12 } });
    setStructuredRunnerForTests(async () => null);
    await expect(askStructured({ name: 't', schema: OfferExtractionSchema, system: '', prompt: '', simulate: () => simulateExtraction('') })).rejects.toThrow(/illisible deux fois/);
  });
});

describe('plan de publication', () => {
  it('répartit 20 vidéos selon le rythme (3 par semaine : lundi, mercredi, vendredi)', () => {
    const plan = buildPlan({ productId: 'p', productName: 'Sérum', rhythm: 3, start: '2026-11-16' });
    expect(plan.items).toHaveLength(20);
    expect(plan.items.slice(0, 4).map((i) => i.date)).toEqual(['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-23']);
    expect(buildPlan({ productId: 'p', productName: 'S', rhythm: 7, start: '2026-11-16' }).items.at(-1)?.date).toBe('2026-12-05');
    expect(dueOn(plan, '2026-11-18').map((i) => i.n)).toEqual([2]);
  });

  it('exporte un calendrier .ics valide (CRLF, lignes de 75 octets, texte échappé)', () => {
    const plan = buildPlan({ productId: 'p', productName: 'Sérum, éclat; « peau » très très longue description de produit', rhythm: 5, start: '2026-11-16' });
    const ics = planToIcs(plan, 'plan-1', 'https://tracktout.com', new Date('2026-11-12T10:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(20);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261116\r\nDTEND;VALUE=DATE:20261117');
    expect(ics).toContain('UID:plan-1-1@');
    expect(ics).toContain('DTSTAMP:20261112T100000Z');
    expect(ics).toContain('Sérum\\, éclat\; « peau »');
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
  });

  it('rappel par e-mail une seule fois par jour, pour les abonnés (dès Starter), à l’heure du récap', async () => {
    for (const [id, plan] of [['pro', 'pro'], ['starter', 'starter'], ['sans-abo', 'aucun']] as const) {
      await repo.ensureProfile({ id, email: `${id}@test.fr` });
      await repo.updateProfile(id, { plan, digest_hour: 9 });
      await repo.saveRecord(id, 'publication', buildPlan({ productId: 'p', productName: 'Sérum', rhythm: 7, start: '2026-11-12' }));
    }
    expect(await schedulePublicationEmails('2026-11-12', repo, new Date('2026-11-12T03:00:00Z'))).toBe(2);
    expect(await schedulePublicationEmails('2026-11-12', repo, new Date('2026-11-12T03:00:00Z'))).toBe(0);
    const mails = await repo.listLocalEmails!(5);
    expect(mails.map((m) => m.to).sort()).toEqual(['pro@test.fr', 'starter@test.fr']);
    expect(mails[0]).toMatchObject({ subject: 'Aujourd’hui : ta vidéo n°1 sur Sérum', scheduled_at: '2026-11-12T08:00:00.000Z' });
  });
});

describe('analyse de vidéo virale', () => {
  it('reconnaît un lien de vidéo TikTok, rien d’autre', () => {
    expect(tiktokVideoId('https://www.tiktok.com/@compte/video/7704347066079677729?lang=fr')).toBe('7704347066079677729');
    expect(tiktokVideoId('https://vm.tiktok.com/ZMabc/')).toBeNull();
    expect(tiktokVideoId('https://exemple.com/video/7704347066079677729')).toBeNull();
    expect(tiktokVideoId('pas un lien')).toBeNull();
  });

  it('analyse simulée conforme au schéma, découpée sur la durée réelle', () => {
    const a = simulateAnalysis('Tu as la peau sèche ? Moi aussi. Regarde ce sérum. Après 7 jours, voilà. Lien dans le panier.', 20, 'Sérum');
    expect(AnalysisSchema.safeParse(a).success).toBe(true);
    expect(a.segments.map((s) => s.role)).toEqual(['accroche', 'probleme', 'demonstration', 'preuve', 'appel_action']);
    expect(a.segments.at(-1)?.to_s).toBe(20);
    expect(a.hook_type).toBe('Question directe');
    expect(a.adapted.lines.join(' ')).toMatch(/Collaboration commerciale/);
  });

  it('lit les chiffres d’une vidéo Nexscope (batchVideoDetail) sans rien inventer', () => {
    expect(mapNexscopeVideoFacts({ videoId: '1', videoDesc: ' Ma routine ', duration: '17', totalViewsCnt: 529386, createDate: '2026-10-24 01:34:07' })).toEqual({
      description: 'Ma routine', duration_s: 17, views: 529386, likes: null, shares: null, sales: null, published_at: '2026-10-24',
    });
  });
});

describe('Europe', () => {
  it('collecte la France seule par défaut, plus les pays de ENABLED_REGIONS', () => {
    expect(enabledRegions()).toEqual(['FR']);
    vi.stubEnv('ENABLED_REGIONS', 'de, es,xx');
    expect(enabledRegions()).toEqual(['FR', 'DE', 'ES']);
  });

  it('le pays choisi ne vaut qu’en Elite', () => {
    expect(regionFor({ plan: 'elite', region: 'DE' })).toBe('DE');
    expect(regionFor({ plan: 'elite', region: 'ES' })).toBe('ES');
    for (const plan of ['aucun', 'starter', 'pro'] as const) expect(regionFor({ plan, region: 'DE' })).toBe('FR');
  });

  it('garde des identifiants France inchangés et sépare les autres pays', () => {
    expect(nexscopeId('123')).toBe('nx-123');
    expect(nexscopeId('123', 'DE')).toBe('nx-de-123');
    expect(sourceProductId('nx-de-123')).toBe('123');
    expect(sourceProductId('nx-123')).toBe('123');
  });

  it('un pays à la fois dans le catalogue, chacun avec son relevé', () => {
    const p = (id: string, region: 'FR' | 'DE', updated: string) =>
      ({ id, provider: 'nexscope', region, snapshot_date: '2026-11-12', updated_at: updated }) as unknown as Product;
    const all = [p('fr1', 'FR', '2026-11-12T03:00:00Z'), p('de1', 'DE', '2026-11-12T03:10:00Z')];
    expect(selectLiveCatalog(all, new Date('2026-11-12T08:00:00Z')).products.map((x) => x.id)).toEqual(['fr1']);
    expect(selectLiveCatalog(all, new Date('2026-11-12T08:00:00Z'), 'DE').products.map((x) => x.id)).toEqual(['de1']);
    expect(selectLiveCatalog(all, new Date('2026-11-12T08:00:00Z'), 'IT').products).toEqual([]);
  });
});

describe('notifications communes', () => {
  it('garde la notification dans le centre, envoie l’e-mail demandé, une seule fois par clé et par jour', async () => {
    const { notify, listNotifications } = await import('@/lib/notify');
    await repo.ensureProfile({ id: 'n', email: 'n@test.fr' });
    const first = await notify('n', { type: 'alerte', title: 'Alerte : 2 produits', body: 'Sérum, Gourde', path: '/app', channels: { email: true }, dedupeKey: 'regle-1' }, repo);
    expect(first).toMatchObject({ type: 'alerte', read: false, channels: { push: false, email: true, discord: false } });
    expect(await notify('n', { type: 'alerte', title: 'x', body: 'y', path: '/app', dedupeKey: 'regle-1' }, repo)).toBeNull();
    expect(await listNotifications('n', repo)).toHaveLength(1);
    expect((await repo.listLocalEmails!(5))[0]).toMatchObject({ to: 'n@test.fr', subject: 'Alerte : 2 produits' });
  });
});
