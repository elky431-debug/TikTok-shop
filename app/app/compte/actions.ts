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
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  const safeTheme: Theme = theme === 'light' || theme === 'dark' ? theme : 'system';
  await getRepo().updateProfile(profile.id, { theme: safeTheme, share_email_with_coach: share });
  if (safeTheme === 'system') cookies().delete(THEME_COOKIE);
  else cookies().set(THEME_COOKIE, safeTheme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  revalidatePath('/app', 'layout');
  back('ok=preferences#preferences');
}

/** Droit à l'effacement (RGPD) : résilie l'abonnement puis supprime toutes les données. */
export async function deleteAccountAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/compte');
  if (String(formData.get('confirmation') ?? '').trim().toUpperCase() !== 'SUPPRIMER') back('erreur=confirmation#suppression');
  try {
    await getBilling().cancelAll({ profile });
  } catch (error) {
    console.error('[suppression] résiliation', error);
    back('erreur=resiliation#suppression');
  }
  await getRepo().deleteUser(profile.id);
  if (isLocalMode()) cookies().delete(LOCAL_SESSION_COOKIE);
  else await createSupabaseServerClient().auth.signOut();
  cookies().delete(THEME_COOKIE);
  redirect('/compte-supprime');
}
