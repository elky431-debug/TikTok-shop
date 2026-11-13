'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LOCAL_SESSION_COOKIE, THEME_COOKIE } from '@/lib/auth/constants';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getBilling } from '@/lib/billing';
import { getRepo } from '@/lib/db';
import type { Theme } from '@/lib/db/types';
import { isLocalMode } from '@/lib/env';
import { isNicheId, type NicheId } from '@/lib/niches';
import { isFollowerRange, isVideoStyle } from '@/lib/profile-rules';
import { setDisabledLifecycle } from '@/lib/lifecycle/preferences';
import { cancelScheduledEmails } from '@/lib/lifecycle/scheduled';
import { isLifecycleType, LIFECYCLE_TYPES } from '@/lib/lifecycle/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPlan } from '@/lib/plans';
import { isRegionId } from '@/lib/regions';

function back(param: string): never {
  redirect(`/app/compte?${param}`);
}

export async function updateProfileAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/compte');
  const firstName = String(formData.get('prenom') ?? '').trim().slice(0, 60);
  const handle = String(formData.get('pseudo') ?? '').trim().replace(/^@+/, '').slice(0, 40);
  const range = formData.get('abonnes');
  const niches = [...new Set(formData.getAll('niches').filter(isNicheId))] as NicheId[];
  const style = formData.get('style');
  const phrase = String(formData.get('phrase') ?? '').trim().slice(0, 240);

  if (!firstName) back('erreur=prenom#profil');
  if (handle && !/^[A-Za-z0-9._]{2,24}$/.test(handle)) back('erreur=pseudo#profil');
  if (!isFollowerRange(range)) back('erreur=abonnes#profil');
  if (niches.length === 0 || niches.length > 3) back('erreur=niches#niches');
  if (!isVideoStyle(style)) back('erreur=style#profil');

  await getRepo().updateProfile(profile.id, {
    first_name: firstName,
    tiktok_handle: handle || null,
    follower_range: range,
    niches,
    video_style: style,
    example_phrase: phrase || null,
  });
  revalidatePath('/app', 'layout');
  back('ok=profil#profil');
}

export async function updatePreferencesAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/compte');
  const theme = String(formData.get('theme') ?? 'system') as Theme;
  const share = formData.get('partage') === '1';
  // Sombre par défaut ; le clair est une option du compte.
  const safeTheme: Theme = theme === 'light' ? 'light' : 'dark';
  await getRepo().updateProfile(profile.id, { theme: safeTheme, share_email_with_coach: share });
  if (safeTheme === 'light') cookies().set(THEME_COOKIE, 'light', { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  else cookies().delete(THEME_COOKIE);
  revalidatePath('/app', 'layout');
  back('ok=preferences#preferences');
}

/** E-mails de cycle de vie : chaque type coché est reçu, chaque type décoché est coupé. */
export async function updateEmailPreferencesAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/compte');
  const wanted = new Set(formData.getAll('emails').filter(isLifecycleType));
  await setDisabledLifecycle(profile.id, LIFECYCLE_TYPES.filter((t) => !wanted.has(t)));
  revalidatePath('/app/compte');
  back('ok=emails#emails');
}

/**
 * Droit à l'effacement (RGPD) : résilie l'abonnement, annule les e-mails déjà programmés (récap, cycle de vie), puis
 * supprime toutes les données (profil, scripts, produits suivis, récaps, fiches de tous les types, abonnements push…).
 */
export async function deleteAccountAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/compte');
  if (String(formData.get('confirmation') ?? '').trim().toUpperCase() !== 'SUPPRIMER') back('erreur=confirmation#suppression');
  try {
    await getBilling().cancelAll({ profile });
  } catch (error) {
    console.error('[suppression] résiliation', error);
    back('erreur=resiliation#suppression');
  }
  await cancelScheduledEmails(profile.id).catch((error) => console.warn('[suppression] e-mails programmés', error));
  await getRepo().deleteUser(profile.id);
  if (isLocalMode()) cookies().delete(LOCAL_SESSION_COOKIE);
  else await createSupabaseServerClient().auth.signOut();
  cookies().delete(THEME_COOKIE);
  redirect('/compte-supprime');
}

/** Pays du catalogue (Pro+). L'interface reste en français. */
export async function updateRegionAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/compte');
  const region = formData.get('pays');
  if (!getPlan(profile.plan).europe || !isRegionId(region)) redirect('/app/compte?erreur=pays#pays');
  await getRepo().updateProfile(profile.id, { region });
  revalidatePath('/app');
  redirect('/app/compte?ok=pays#pays');
}
