'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { sendDigestEmail } from '@/lib/digest/deliver';
import { saveRecapSettings, SUNDAY_HOURS } from '@/lib/digest/settings';
import { getTodayDigest } from '@/lib/digest/today';
import { sendWeeklyRecap } from '@/lib/digest/weekly';
import { createDiscordLinkCode } from '@/lib/discord';
import { unlinkDiscordAccount } from '@/lib/discord/link';
import { getPlan } from '@/lib/plans';
import { DIGEST_HOURS } from '@/lib/profile-rules';
import { listPushSubscriptions } from '@/lib/webpush/subscriptions';

/** Réglages du récap du matin : heure, e-mail, Discord (Pro), push (si un appareil est abonné). */
export async function saveDigestSettingsAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/recap');
  const hour = Number(formData.get('heure'));
  const email = formData.get('email') === '1';
  const discord = formData.get('discord') === '1' && getPlan(profile.plan).discordDigest;
  const push = formData.get('push') === '1' && (await listPushSubscriptions(profile.id)).length > 0;
  const updated = await getRepo().updateProfile(profile.id, {
    digest_hour: (DIGEST_HOURS as readonly number[]).includes(hour) ? hour : 8,
    digest_email: email,
    digest_discord: discord,
  });
  await saveRecapSettings(updated, { matin: { push } });
  revalidatePath('/app/recap');
  redirect('/app/recap?ok=reglages#reglages');
}

/** Réglages du récap du dimanche : heure, e-mail, Discord (Pro), push. */
export async function saveSundaySettingsAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/recap');
  const hour = Number(formData.get('heure'));
  await saveRecapSettings(profile, {
    dimanche: {
      heure: (SUNDAY_HOURS as readonly number[]).includes(hour) ? hour : 18,
      email: formData.get('email') === '1',
      discord: formData.get('discord') === '1' && getPlan(profile.plan).discordDigest && Boolean(profile.discord_user_id),
      push: formData.get('push') === '1' && (await listPushSubscriptions(profile.id)).length > 0,
    },
  });
  revalidatePath('/app/recap');
  redirect('/app/recap?ok=dimanche#reglages-dimanche');
}

export async function createDiscordCodeAction() {
  const { profile } = await requireOnboardedViewer('/app/recap');
  const { code } = await createDiscordLinkCode(profile.id);
  redirect(`/app/recap?code=${code}#discord`);
}

export async function unlinkDiscordAction() {
  const { profile } = await requireOnboardedViewer('/app/recap');
  if (profile.discord_user_id) await unlinkDiscordAccount(profile.discord_user_id);
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

/** Envoie le récap de la semaine en cours tout de suite, par e-mail (pour voir à quoi il ressemble). */
export async function sendTestWeeklyAction() {
  const { profile } = await requireOnboardedViewer('/app/recap');
  if (!getPlan(profile.plan).weeklyDigest) redirect('/app/passer-pro');
  const { sent } = await sendWeeklyRecap(profile, { email: true, discord: false, push: false }, undefined, undefined, { test: true });
  revalidatePath('/app/recap');
  redirect(sent.email ? '/app/recap?ok=dimanche-envoye#dimanche' : '/app/recap?erreur=envoi#dimanche');
}
