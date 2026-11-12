'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { openNotification } from '@/lib/notification-center';
import { markNotificationsRead, notify } from '@/lib/notify';
import { isPushConfigured } from '@/lib/webpush/config';
import { listPushSubscriptions } from '@/lib/webpush/subscriptions';

export async function markAllReadAction() {
  const { profile } = await requireOnboardedViewer('/app/notifications');
  await markNotificationsRead(profile.id);
  revalidatePath('/app', 'layout');
  redirect('/app/notifications?ok=lues');
}

/** Ouvre une notification : marquée comme lue, puis la page qu'elle concerne. */
export async function openNotificationAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/notifications');
  const path = await openNotification(profile.id, String(formData.get('id') ?? ''));
  revalidatePath('/app', 'layout');
  redirect(path ?? '/app/notifications');
}

/** Notification de test sur les appareils abonnés (rangée aussi dans le centre). */
export async function sendTestPushAction() {
  const { profile } = await requireOnboardedViewer('/app/notifications');
  if (!isPushConfigured()) redirect('/app/notifications?erreur=push-inactif');
  if (!(await listPushSubscriptions(profile.id)).length) redirect('/app/notifications?erreur=aucun-appareil');
  const result = await notify(profile.id, {
    type: 'systeme',
    title: 'Notification de test',
    body: 'Les notifications marchent sur cet appareil. Tu recevras ici tes récaps et tes alertes, selon tes réglages.',
    path: '/app/notifications',
    channels: { push: true },
  });
  revalidatePath('/app/notifications');
  redirect(result?.channels.push ? '/app/notifications?ok=test' : '/app/notifications?erreur=test');
}
