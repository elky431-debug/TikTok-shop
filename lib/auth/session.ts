import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getRepo } from '@/lib/db';
import type { Coach, Profile } from '@/lib/db/types';
import { isAdminEmail, isLocalMode } from '@/lib/env';
import { getPlan } from '@/lib/plans';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LOCAL_SESSION_COOKIE } from './constants';
import { verifyLocalSessionToken } from './local-session';

export interface SessionUser {
  id: string;
  email: string;
}

export interface Viewer {
  user: SessionUser;
  profile: Profile;
  isAdmin: boolean;
}

/** Utilisateur connecté (ou null). Mis en cache pour la durée de la requête. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (isLocalMode()) {
    const payload = verifyLocalSessionToken(cookies().get(LOCAL_SESSION_COOKIE)?.value);
    return payload ? { id: payload.uid, email: payload.email } : null;
  }
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? '' } : null;
});

/** Utilisateur + profil (créé au besoin). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = await getRepo().ensureProfile(user);
  return { user, profile, isAdmin: isAdminEmail(user.email) };
});

export async function requireViewer(next = '/app'): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/connexion?suite=${encodeURIComponent(next)}`);
  return viewer;
}

/**
 * Exige un compte dont l'onboarding est terminé et, par défaut, un abonnement : tout est payant, un compte sans
 * abonnement choisit d'abord son plan (/abonnement). `{ abonnement: false }` pour les rares pages ouvertes sans
 * abonnement : compte (résiliation, suppression), paiement, consentement formateur, et la coque de l'appli.
 */
export async function requireOnboardedViewer(next = '/app', options: { abonnement?: boolean } = {}): Promise<Viewer> {
  const viewer = await requireViewer(next);
  // Pas encore d'onboarding, ou ancien onboarding : les nouvelles questions sont posées une fois.
  if (!viewer.profile.onboarded_at || (viewer.profile.onboarding_version ?? 1) < 2) redirect('/bienvenue');
  if (options.abonnement !== false && !getPlan(viewer.profile.plan).access) redirect('/abonnement');
  return viewer;
}

export const getCoachForViewer = cache(async (userId: string): Promise<Coach | null> => {
  return getRepo().getCoachByUserId(userId);
});

export async function requireCoach(): Promise<Viewer & { coach: Coach }> {
  const viewer = await requireViewer('/formateur');
  const coach = await getCoachForViewer(viewer.user.id);
  if (!coach) redirect('/app?acces=formateur');
  return { ...viewer, coach };
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer('/admin');
  if (!viewer.isAdmin) redirect('/app?acces=admin');
  return viewer;
}
