import { getRepo } from '@/lib/db';
import type { Coach, Profile } from '@/lib/db/types';

export type ReferralResult =
  | { kind: 'coach'; coach: Coach }
  | { kind: 'parrain'; referrer: Profile }
  | { kind: 'none'; reason?: 'deja' | 'inconnu' | 'soi-meme' };

export function normalizeCode(code: string | null | undefined): string {
  return (code ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 24);
}

/** Décrit un code (formateur ou parrain) sans rien modifier. */
export async function describeCode(code: string | null | undefined): Promise<ReferralResult> {
  const normalized = normalizeCode(code);
  if (!normalized) return { kind: 'none', reason: 'inconnu' };
  const repo = getRepo();
  const coach = await repo.getCoachByPromoCode(normalized);
  if (coach) return { kind: 'coach', coach };
  const referrer = await repo.getProfileByReferralCode(normalized);
  if (referrer) return { kind: 'parrain', referrer };
  return { kind: 'none', reason: 'inconnu' };
}

/**
 * Rattache un nouvel inscrit à un formateur (code promo) ou à un parrain (code de parrainage).
 * Uniquement avant la fin de l'onboarding, et une seule fois.
 */
export async function applyReferralCode(profile: Profile, code: string | null | undefined): Promise<ReferralResult> {
  if (profile.coach_id || profile.referred_by) return { kind: 'none', reason: 'deja' };
  if (profile.onboarded_at) return { kind: 'none', reason: 'deja' };
  const found = await describeCode(code);
  const repo = getRepo();

  if (found.kind === 'coach') {
    if (found.coach.user_id === profile.id) return { kind: 'none', reason: 'soi-meme' };
    await repo.updateProfile(profile.id, { coach_id: found.coach.id });
    await repo.createReferral({ referrer_id: found.coach.user_id, referred_id: profile.id, coach_id: found.coach.id });
    return found;
  }

  if (found.kind === 'parrain') {
    if (found.referrer.id === profile.id) return { kind: 'none', reason: 'soi-meme' };
    await repo.updateProfile(profile.id, { referred_by: found.referrer.id });
    await repo.createReferral({ referrer_id: found.referrer.id, referred_id: profile.id, coach_id: null });
    return found;
  }

  return found;
}

export function referralLink(siteUrl: string, code: string): string {
  return `${siteUrl}/r/${encodeURIComponent(code)}`;
}
