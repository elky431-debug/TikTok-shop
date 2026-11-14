'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { sendDigestEmail } from '@/lib/digest/deliver';
import { saveRecapSettings } from '@/lib/digest/settings';
import { getTodayDigest } from '@/lib/digest/today';
import { createDiscordLinkCode } from '@/lib/discord';
import { unlinkDiscordAccount } from '@/lib/discord/link';
import { getPlan } from '@/lib/plans';
import { DIGEST_HOURS } from '@/lib/profile-rules';
import { listPushSubscriptions } from '@/lib/webpush/subscriptions';

/**
 * Réglages essentiels des récaps : récap du matin par e-mail et son heure, bilan du dimanche par e-mail (Pro). Les
 * notifications et Discord ne sont enregistrés que s'ils étaient proposés (`canal_push`, `canal_discord`) : sinon on
 * garde ce qui était choisi.
 */
export async function saveRecapAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/recap');
  const plan = getPlan(profile.plan);
  const hour = Number(formData.get('heure'));
  const morning = formData.get('matin') === '1';
  const sunday = formData.get('dimanche') === '1' && plan.weeklyDigest;
  const pushShown = formData.get('canal_push') === '1';
  const discordShown = formData.get('canal_discord') === '1';
  const push = pushShown && formData.get('push') === '1' && (await listPushSubscriptions(profile.id)).length > 0;
  const discord = discordShown && formData.get('discord') === '1' && plan.discordDigest && Boolean(profile.discord_user_id);
  const updated = await getRepo().updateProfile(profile.id, {
    digest_hour: (DIGEST_HOURS as readonly number[]).includes(hour) ? hour : 8,
    digest_email: morning,
    ...(discordShown ? { digest_discord: discord } : {}),
  });
  await saveRecapSettings(updated, {
    ...(pushShown ? { matin: { push } } : {}),
    dimanche: { email: sunday, ...(pushShown ? { push: push && plan.weeklyDigest } : {}), ...(discordShown ? { discord: discord && plan.weeklyDigest } : {}) },
  });
  revalidatePath('/app/recap');
  redirect('/app/recap?ok=reglages#reglages');
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
