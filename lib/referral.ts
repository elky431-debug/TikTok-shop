import { getRepo, type Repo } from '@/lib/db';
import type { Coach, Commission, Profile, UserRecord } from '@/lib/db/types';
import { COACH_FIRST_MONTH_DISCOUNT } from '@/lib/plans';
import { parisDate } from '@/lib/utils';

/**
 * Résultat d'un code saisi à l'inscription. Seuls les codes formateur comptent : le parrainage entre utilisateurs a été
 * retiré le 14 novembre (les anciens codes personnels ne rattachent plus personne ; les lignes existantes restent en base).
 */
export type ReferralResult =
  | { kind: 'coach'; coach: Coach; /** Code tapé (principal ou supplémentaire). */ code: string }
  | { kind: 'none'; reason?: 'deja' | 'inconnu' | 'soi-meme' };

export function normalizeCode(code: string | null | undefined): string {
  return (code ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 24);
}

// ---------------------------------------------------------------------------------------------------------------------
// Codes supplémentaires des formateurs (une promo, une formation, une session…) : fiche `code_formateur` du formateur,
// écrite par le serveur seul (RLS). L'inscription avec n'importe lequel rattache l'élève au formateur et à ce code
// (fiche `rattachement_formateur` de l'élève).
// ---------------------------------------------------------------------------------------------------------------------
export const COACH_CODE_KIND = 'code_formateur';
export const COACH_LINK_KIND = 'rattachement_formateur';
/** Codes supplémentaires par formateur (en plus du code principal). */
export const MAX_EXTRA_CODES = 10;

export interface CoachCodeData {
  code: string;
  /** Nom interne de la promo ou de la formation (« Promo janvier »). */
  label: string;
  active: boolean;
}

export interface CoachLinkData {
  coach_id: string;
  code: string;
}

export const isValidCode = (code: string) => /^[A-Z0-9-]{3,24}$/.test(code);

/** Code supplémentaire actif correspondant à ce texte (le plus ancien gagne en cas de doublon). */
export async function findExtraCoachCode(code: string, repo: Repo = getRepo()): Promise<{ coach: Coach; record: UserRecord<CoachCodeData> } | null> {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const matches = (await repo.listAllRecords<CoachCodeData>(COACH_CODE_KIND))
    .filter((r) => r.data?.code === normalized && r.data.active !== false)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const record of matches) {
    const coach = await repo.getCoachByUserId(record.user_id);
    if (coach) return { coach, record };
  }
  return null;
}

/** Un code est-il déjà pris (code principal, ancien code personnel ou code supplémentaire) ? */
export async function isCodeTaken(code: string, repo: Repo = getRepo()): Promise<boolean> {
  const normalized = normalizeCode(code);
  return Boolean(
    (await repo.getCoachByPromoCode(normalized)) ||
      (await repo.getProfileByReferralCode(normalized)) ||
      (await repo.listAllRecords<CoachCodeData>(COACH_CODE_KIND)).some((r) => r.data?.code === normalized),
  );
}

export async function listCoachCodes(coach: Coach, repo: Repo = getRepo()) {
  const extra = await repo.listRecords<CoachCodeData>(coach.user_id, COACH_CODE_KIND);
  return [
    { id: null as string | null, code: coach.promo_code, label: 'Code principal', active: true, main: true, created_at: coach.created_at },
    ...extra
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((r) => ({ id: r.id as string | null, code: r.data.code, label: r.data.label, active: r.data.active !== false, main: false, created_at: r.created_at })),
  ];
}

export type AddCodeResult = { ok: true; code: string } | { ok: false; error: 'format' | 'pris' | 'limite' };

export async function addCoachCode(coach: Coach, rawCode: string, rawLabel: string, repo: Repo = getRepo()): Promise<AddCodeResult> {
  const code = normalizeCode(rawCode);
  if (!isValidCode(code)) return { ok: false, error: 'format' };
  if ((await repo.listRecords(coach.user_id, COACH_CODE_KIND)).length >= MAX_EXTRA_CODES) return { ok: false, error: 'limite' };
  if (await isCodeTaken(code, repo)) return { ok: false, error: 'pris' };
  const label = rawLabel.trim().replace(/\s+/g, ' ').slice(0, 60) || code;
  await repo.saveRecord<CoachCodeData>(coach.user_id, COACH_CODE_KIND, { code, label, active: true });
  return { ok: true, code };
}

/** Met en pause ou réactive un code supplémentaire (les élèves déjà inscrits restent rattachés). */
export async function setCoachCodeActive(coach: Coach, recordId: string, active: boolean, repo: Repo = getRepo()): Promise<boolean> {
  const record = await repo.getRecord<CoachCodeData>(coach.user_id, recordId);
  if (!record || record.kind !== COACH_CODE_KIND) return false;
  await repo.saveRecord<CoachCodeData>(coach.user_id, COACH_CODE_KIND, { ...record.data, active }, record.id);
  return true;
}

/** Décrit un code formateur (principal ou supplémentaire) sans rien modifier. */
export async function describeCode(code: string | null | undefined, repo: Repo = getRepo()): Promise<ReferralResult> {
  const normalized = normalizeCode(code);
  if (!normalized) return { kind: 'none', reason: 'inconnu' };
  const coach = await repo.getCoachByPromoCode(normalized);
  if (coach) return { kind: 'coach', coach, code: normalized };
  const extra = await findExtraCoachCode(normalized, repo);
  if (extra) return { kind: 'coach', coach: extra.coach, code: normalized };
  return { kind: 'none', reason: 'inconnu' };
}

/**
 * Rattache un nouvel inscrit à un formateur (code principal ou supplémentaire).
 * Uniquement avant la fin de l'onboarding, et une seule fois.
 */
export async function applyReferralCode(profile: Profile, code: string | null | undefined): Promise<ReferralResult> {
  if (profile.coach_id || profile.referred_by) return { kind: 'none', reason: 'deja' };
  if (profile.onboarded_at) return { kind: 'none', reason: 'deja' };
  const repo = getRepo();
  const found = await describeCode(code, repo);

  if (found.kind === 'coach') {
    if (found.coach.user_id === profile.id) return { kind: 'none', reason: 'soi-meme' };
    await repo.updateProfile(profile.id, { coach_id: found.coach.id });
    await repo.createReferral({ referrer_id: found.coach.user_id, referred_id: profile.id, coach_id: found.coach.id });
    await repo.saveRecord<CoachLinkData>(profile.id, COACH_LINK_KIND, { coach_id: found.coach.id, code: found.code });
    return found;
  }

  return found;
}

export function referralLink(siteUrl: string, code: string): string {
  return `${siteUrl}/r/${encodeURIComponent(code)}`;
}

/** Page d'accueil co-brandée d'un formateur. */
export function coachLandingLink(siteUrl: string, code: string): string {
  return `${siteUrl}/f/${encodeURIComponent(code)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Gains et versements des formateurs. Une commission naît à chaque facture payée par un élève (lib/billing),
// elle est réduite au prorata d'un remboursement. Les versements sont manuels en V1 : l'admin marque chaque virement
// (fiche `versement` du bénéficiaire, écrite par le serveur seul). Solde = commissions − versements ; il peut passer
// sous zéro si une commission déjà versée est remboursée (retenu sur le versement suivant).
// ---------------------------------------------------------------------------------------------------------------------
export const PAYOUT_KIND = 'versement';
/** Seuil de versement (hypothèse business de RAPPORT.md : virement mensuel dès 50 € cumulés). */
export const PAYOUT_THRESHOLD_CENTS = 5000;

export interface PayoutData {
  amount_cents: number;
  /** Jour du virement (AAAA-MM-JJ). */
  paid_on: string;
  /** Référence du virement (libellé bancaire), facultative. */
  reference: string | null;
}

export interface Earnings {
  commissions: Commission[];
  payouts: Array<UserRecord<PayoutData>>;
  /** Commissions restantes après remboursements, depuis le début. */
  earnedCents: number;
  paidCents: number;
  balanceCents: number;
  canceledCents: number;
  thisMonthCents: number;
  next: { date: string; eligible: boolean; missingCents: number };
}

/** Premier jour du mois suivant (AAAA-MM-JJ). */
export function nextMonthStart(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/** « décembre » (mois d'une date AAAA-MM-JJ). */
export function monthName(day: string): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
}

export function summarizeEarnings(commissions: Commission[], payouts: Array<UserRecord<PayoutData>>, now = new Date()): Earnings {
  const today = parisDate(now);
  const month = today.slice(0, 7);
  const earnedCents = commissions.reduce((s, c) => s + c.amount_cents, 0);
  const paidCents = payouts.reduce((s, p) => s + (Number(p.data?.amount_cents) || 0), 0);
  const balanceCents = earnedCents - paidCents;
  return {
    commissions: [...commissions].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    payouts: [...payouts].sort((a, b) => (b.data.paid_on ?? '').localeCompare(a.data.paid_on ?? '') || b.created_at.localeCompare(a.created_at)),
    earnedCents,
    paidCents,
    balanceCents,
    canceledCents: commissions.reduce((s, c) => s + (c.canceled_cents ?? 0), 0),
    thisMonthCents: commissions.filter((c) => c.month === month).reduce((s, c) => s + c.amount_cents, 0),
    next: {
      date: nextMonthStart(today),
      eligible: balanceCents >= PAYOUT_THRESHOLD_CENTS,
      missingCents: Math.max(0, PAYOUT_THRESHOLD_CENTS - balanceCents),
    },
  };
}

export async function getEarnings(userId: string, repo: Repo = getRepo(), now = new Date()): Promise<Earnings> {
  const [commissions, payouts] = await Promise.all([repo.listCommissions(userId), repo.listRecords<PayoutData>(userId, PAYOUT_KIND)]);
  return summarizeEarnings(commissions, payouts, now);
}

/** Versement marqué par l'admin (jamais plus que le solde dû). */
export async function recordPayout(
  userId: string,
  input: { amountCents: number; paidOn: string; reference?: string | null },
  repo: Repo = getRepo(),
): Promise<{ ok: true } | { ok: false; error: 'montant' | 'date' | 'solde' }> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return { ok: false, error: 'montant' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) return { ok: false, error: 'date' };
  const { balanceCents } = await getEarnings(userId, repo);
  if (input.amountCents > balanceCents) return { ok: false, error: 'solde' };
  await repo.saveRecord<PayoutData>(userId, PAYOUT_KIND, {
    amount_cents: input.amountCents,
    paid_on: input.paidOn,
    reference: input.reference?.trim().slice(0, 80) || null,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// Message prêt à envoyer aux élèves d'un formateur. Aucun chiffre de gains, aucune promesse de résultat.
// ---------------------------------------------------------------------------------------------------------------------
export function coachStudentsMessage(input: { link: string; code: string }): string {
  const percent = Math.round(COACH_FIRST_MONTH_DISCOUNT * 100);
  return `Pour choisir tes produits TikTok Shop chaque matin et écrire tes scripts, utilise ${input.link} : avec mon code ${input.code}, tu as −${percent} % sur ton premier mois.`;
}
