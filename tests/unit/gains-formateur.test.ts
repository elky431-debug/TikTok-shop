import { ImageResponse } from 'next/og';
import { createElement } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findIssues } from '@/lib/ai/guard';
import { createLocalSessionToken } from '@/lib/auth/local-session';
import { LOCAL_SESSION_COOKIE } from '@/lib/auth/constants';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { SHARE_FORMATS, ShareVisual } from '@/lib/og';
import { coachStudentsMessage, getEarnings, nextMonthStart, PAYOUT_KIND, PAYOUT_THRESHOLD_CENTS, recordPayout } from '@/lib/referral';

// Session simulée (mode local) : le cookie de session est lu par next/headers.
let sessionCookie: string | undefined;
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (name === LOCAL_SESSION_COOKIE && sessionCookie ? { name, value: sessionCookie } : undefined) }),
}));

// `cache` de React n'existe que dans le rendu serveur de Next : ici, une simple fonction.
vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), cache: <T,>(fn: T) => fn }));

let repo: LocalRepo;

async function commission(referralId: string, invoice: string, cents: number, month = '2026-11') {
  await repo.addCommission({ referral_id: referralId, referrer_id: 'parrain', invoice_id: invoice, amount_cents: cents, month });
}

beforeEach(async () => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
  sessionCookie = undefined;
  await repo.ensureProfile({ id: 'parrain', email: 'parrain@test.fr' });
  await repo.ensureProfile({ id: 'filleul', email: 'filleul@test.fr' });
});
afterAll(() => setRepoForTests(null));

/** Largeur et hauteur d'un PNG (en-tête IHDR). */
function pngSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { signature: Array.from(bytes.slice(1, 4), (b) => String.fromCharCode(b)).join(''), width: view.getUint32(16), height: view.getUint32(20) };
}

describe('gains, solde et prochains versements', () => {
  it('solde = commissions − versements ; un remboursement après versement est retenu ; versement seulement dans la limite du solde', async () => {
    const referral = (await repo.createReferral({ referrer_id: 'parrain', referred_id: 'filleul', coach_id: null }))!;
    await commission(referral.id, 'in_1', 3000, '2026-10');
    await commission(referral.id, 'in_2', 3000, '2026-11');
    const now = new Date('2026-11-20T10:00:00Z');
    let earnings = await getEarnings('parrain', repo, now);
    expect(earnings).toMatchObject({ earnedCents: 6000, paidCents: 0, balanceCents: 6000, thisMonthCents: 3000 });
    expect(earnings.next).toEqual({ date: '2026-12-01', eligible: true, missingCents: 0 });

    expect(await recordPayout('parrain', { amountCents: 7000, paidOn: '2026-12-01' }, repo)).toEqual({ ok: false, error: 'solde' });
    expect(await recordPayout('parrain', { amountCents: 0, paidOn: '2026-12-01' }, repo)).toEqual({ ok: false, error: 'montant' });
    expect(await recordPayout('parrain', { amountCents: 100, paidOn: '1er décembre' }, repo)).toEqual({ ok: false, error: 'date' });
    expect(await recordPayout('parrain', { amountCents: 6000, paidOn: '2026-12-01', reference: 'VIR-123' }, repo)).toEqual({ ok: true });
    earnings = await getEarnings('parrain', repo, now);
    expect(earnings).toMatchObject({ paidCents: 6000, balanceCents: 0 });
    expect(earnings.payouts[0].data).toEqual({ amount_cents: 6000, paid_on: '2026-12-01', reference: 'VIR-123' });
    expect(earnings.next.missingCents).toBe(PAYOUT_THRESHOLD_CENTS);

    // Remboursement total de la facture déjà versée : solde négatif, retenu sur le versement suivant.
    await repo.refundCommission('in_2', 1);
    earnings = await getEarnings('parrain', repo, now);
    expect(earnings).toMatchObject({ earnedCents: 3000, balanceCents: -3000, canceledCents: 3000 });
    expect(await repo.listRecords('parrain', PAYOUT_KIND)).toHaveLength(1);
  });

  it('donne le premier jour du mois suivant, y compris en décembre', () => {
    expect(nextMonthStart('2026-11-12')).toBe('2026-12-01');
    expect(nextMonthStart('2026-12-31')).toBe('2027-01-01');
  });
});

describe('message pour les élèves et visuels', () => {
  it('un message prêt à envoyer avec le lien et le code, sans promesse de gains', () => {
    const text = coachStudentsMessage({ link: 'https://tracktout.com/f/FORM30', code: 'FORM30' });
    expect(text).toContain('https://tracktout.com/f/FORM30');
    expect(text).toContain('avec mon code FORM30, tu as −20 % sur ton premier mois');
    expect(text).not.toMatch(/gratuit|offerts|sans carte/i);
    expect(findIssues(text)).toEqual([]);
  });

  it('génère des visuels PNG aux bonnes dimensions (fond noir, dégradé cyan → rose)', async () => {
    for (const format of ['carre', 'story', 'lien'] as const) {
      const visual = createElement(ShareVisual, { format, title: 'Mes produits à vendre,', accent: 'chaque matin.', badge: 'Code ABC123' });
      const image = new ImageResponse(visual, { ...SHARE_FORMATS[format] });
      expect(image.headers.get('content-type')).toBe('image/png');
      const size = pngSize(new Uint8Array(await image.arrayBuffer()));
      expect(size).toEqual({ signature: 'PNG', ...SHARE_FORMATS[format] });
    }
  }, 30_000);
});
