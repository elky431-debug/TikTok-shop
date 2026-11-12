'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { sendDigestEmail } from '@/lib/digest/deliver';
import { getTodayDigest } from '@/lib/digest/today';
import { createDiscordLinkCode } from '@/lib/discord';
import { getPlan } from '@/lib/plans';
import { DIGEST_HOURS } from '@/lib/profile-rules';

export async function saveDigestSettingsAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/recap');
  const hour = Number(formData.get('heure'));
  const email = formData.get('email') === '1';
  const discord = formData.get('discord') === '1' && getPlan(profile.plan).discordDigest;
  await getRepo().updateProfile(profile.id, {
    digest_hour: (DIGEST_HOURS as readonly number[]).includes(hour) ? hour : 8,
    digest_email: email,
    digest_discord: discord,
  });
  revalidatePath('/app/recap');
  redirect('/app/recap?ok=reglages');
}

export async function createDiscordCodeAction() {
  const { profile } = await requireOnboardedViewer('/app/recap');
  const { code } = await createDiscordLinkCode(profile.id);
  redirect(`/app/recap?code=${code}#discord`);
}

export async function unlinkDiscordAction() {
  const { profile } = await requireOnboardedViewer('/app/recap');
  await getRepo().updateProfile(profile.id, { discord_user_id: null, digest_discord: false });
  revalidatePath('/app/recap');
  redirect('/app/recap?ok=delie#discord');
}

/** Envoie le récap du jour tout de suite, par e-mail (pour tester). */
export async function sendTestDigestAction() {
  const { profile } = await requireOnboardedViewer('/app/recap');
  const digest = await getTodayDigest(profile);
  try {
    await sendDigestEmail({ ...profile, digest_hour: 0 }, digest);
  } catch (error) {
    console.error('[récap test]', error);
    redirect('/app/recap?erreur=envoi');
  }
  redirect('/app/recap?ok=envoye');
}
