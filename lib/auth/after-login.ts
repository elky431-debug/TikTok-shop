import { cookies } from 'next/headers';
import { getRepo } from '@/lib/db';
import { applyReferralCode } from '@/lib/referral';
import { REFERRAL_COOKIE } from './constants';
import { safeNextPath } from './redirects';

/** Après connexion : crée le profil, applique un code mémorisé, choisit la page suivante. */
export async function finishLogin(user: { id: string; email: string }, next: string | null): Promise<string> {
  const repo = getRepo();
  const profile = await repo.ensureProfile(user);
  const code = cookies().get(REFERRAL_COOKIE)?.value;
  if (code && !profile.onboarded_at) {
    await applyReferralCode(profile, code);
  }
  await repo.updateProfile(user.id, { last_seen_at: new Date().toISOString() });
  const destination = safeNextPath(next);
  // L'admin et les formateurs peuvent aller directement à leur espace, sans onboarding.
  if (destination.startsWith('/admin') || destination.startsWith('/formateur')) return destination;
  if (!profile.onboarded_at) return '/bienvenue';
  return destination;
}
