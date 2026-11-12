import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { listNotifications } from '@/lib/notify';
import {
  followUpDate,
  OfferExtractionSchema,
  offerWarnings,
  scoreOffer,
  sendOfferFollowUps,
  simulateExtraction,
  simulateReplies,
  type OfferData,
  type OfferExtraction,
} from '@/lib/v2/offers';
import { makeUser } from './v2-fixtures';

let repo: LocalRepo;
beforeEach(() => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
});
afterEach(() => setRepoForTests(null));

const offer = (o: Partial<OfferExtraction> = {}): OfferExtraction => ({
  brand: 'Lumi', product: 'Sérum', niche: 'beaute', commission_percent: 10, fixed_fee_euros: null, free_sample: true,
  sample_refundable: null, exclusivity: null, deadline_days: null, conditions: [], ...o,
});
// Beauté : 5, 10, 12, 15, 30 → médiane 12, moyenne 14,4. Maison (hors niche) : 50.
const radar = [
  ...[0.05, 0.1, 0.12, 0.15, 0.3].map((r) => ({ niche: 'beaute' as const, commission_rate: r })),
  { niche: 'maison' as const, commission_rate: 0.5 },
];

describe('bloc 7.1 · extraction', () => {
  it('marque, commission, échantillon remboursable, délai et exclusivité (lecture simulée, conforme au schéma)', () => {
    const data = simulateExtraction('Bonjour, de la part de Lumi : 8 % de commission sur notre sérum beauté, échantillon remboursable après publication sous 4 jours. Exclusivité de 3 mois.');
    expect(OfferExtractionSchema.safeParse(data).success).toBe(true);
    expect(data).toMatchObject({ brand: 'Lumi', niche: 'beaute', commission_percent: 8, sample_refundable: true, exclusivity: true, deadline_days: 4 });
  });
});

describe('bloc 7.2 · note comparée au radar de la même niche', () => {
  it('compare seulement aux produits de la niche, avec moyenne et médiane', () => {
    const score = scoreOffer(offer({ commission_percent: 13 }), radar);
    expect(score).toMatchObject({ nicheMedianPercent: 12, nicheAveragePercent: 14.4, comparedWith: 5 });
    expect(score.score).toBeGreaterThan(scoreOffer(offer({ commission_percent: 6 }), radar).score);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(scoreOffer(offer({ niche: null }), radar).comparedWith).toBe(6);
  });
});

describe('bloc 7.3 · points d’attention', () => {
  it('commission sous la moyenne de la niche, exclusivité, délai trop court, échantillon remboursable', () => {
    // 13 % : au-dessus de la médiane (12) mais sous la moyenne (14,4).
    const risky = offer({ commission_percent: 13, exclusivity: true, deadline_days: 3, sample_refundable: true });
    const warnings = offerWarnings(risky, scoreOffer(risky, radar));
    expect(warnings.map((w) => w.code)).toEqual(['commission_basse', 'exclusivite', 'delai_court', 'echantillon_remboursable']);
    expect(warnings[0].text).toContain('14,4 %');
    expect(warnings[2].text).toContain('3 jours');
    const fine = offer({ commission_percent: 20, deadline_days: 14 });
    expect(offerWarnings(fine, scoreOffer(fine, radar))).toEqual([]);
    // Anciennes fiches sans moyenne : la médiane sert de repère.
    expect(offerWarnings(offer({ commission_percent: 11 }), { score: 40, nicheMedianPercent: 12, counterPercent: 12, reasons: [] })[0].code).toBe('commission_basse');
  });
});

describe('bloc 7.4 · trois réponses prêtes à copier', () => {
  it('accepter, négocier avec la contre-proposition chiffrée, refuser poliment', () => {
    const o = offer({ commission_percent: 8 });
    const score = scoreOffer(o, radar);
    expect(score.counterPercent).toBe(13);
    const replies = simulateReplies(o, score, 'Léa');
    expect(Object.keys(replies)).toEqual(['accepter', 'negocier', 'refuser']);
    expect(replies.negocier).toContain('une commission de 13 %');
    expect(replies.refuser).toMatch(/Merci d’avoir pensé à moi/);
    expect(replies.accepter.endsWith('Léa')).toBe(true);
  });
});

describe('bloc 7.5 · historique et rappel de relance', () => {
  const data = (o: Partial<OfferData> = {}): OfferData => ({
    text: 'message', extracted: offer(), score: scoreOffer(offer(), radar), replies: simulateReplies(offer(), scoreOffer(offer(), radar), null),
    status: 'negociee', simulated: true, follow_up_on: '2026-11-15', follow_up_sent: null, ...o,
  });

  it('date de relance entre demain et dans un an', () => {
    expect(followUpDate('2026-11-13', '2026-11-12')).toBe('2026-11-13');
    expect(followUpDate('2026-11-12', '2026-11-12')).toBeNull();
    expect(followUpDate('2027-11-13', '2026-11-12')).toBeNull();
    expect(followUpDate('demain', '2026-11-12')).toBeNull();
  });

  it('tâche nocturne : notification le jour J, une seule fois, rien pour une proposition close ni hors Pro+', async () => {
    await makeUser(repo, 'plus', 'proplus');
    await makeUser(repo, 'pro', 'pro');
    const open = await repo.saveRecord('plus', 'offre', data());
    await repo.saveRecord('plus', 'offre', data({ status: 'acceptee' }));
    await repo.saveRecord('pro', 'offre', data());
    expect(await sendOfferFollowUps('2026-11-14', repo)).toBe(0);
    expect(await sendOfferFollowUps('2026-11-15', repo)).toBe(1);
    expect(await sendOfferFollowUps('2026-11-15', repo)).toBe(0);
    expect(await sendOfferFollowUps('2026-11-16', repo)).toBe(0);
    const [n] = await listNotifications('plus', repo);
    expect(n.data).toMatchObject({ type: 'rappel', title: 'Relance Lumi aujourd’hui', path: `/app/offres?offre=${open.id}`, channels: { email: true } });
    expect((await repo.getRecord<OfferData>('plus', open.id))?.data.follow_up_sent).toBe('2026-11-15');
    expect(await listNotifications('pro', repo)).toHaveLength(0);
  });
});
