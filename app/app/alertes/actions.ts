'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { ALERT_KIND, createAlert, parseAlertCriteria, setAlertActive, type AlertData } from '@/lib/radar/alerts';

function formFields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  return out;
}

export async function createAlertAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/alertes');
  const fields = formFields(formData);
  const result = await createAlert(profile, {
    name: fields.nom,
    criteria: parseAlertCriteria(fields),
    channels: { push: fields.push === '1', email: fields.email === '1', discord: fields.discord === '1' },
  });
  if (!result.ok) {
    if (result.error === 'plan') redirect('/app/passer-pro');
    redirect(`/app/alertes?erreur=${result.error}`);
  }
  revalidatePath('/app/alertes');
  redirect(`/app/alertes?ok=cree&n=${result.matches}`);
}

export async function toggleAlertAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/alertes');
  const result = await setAlertActive(profile, String(formData.get('id') ?? ''), formData.get('actif') === '1');
  revalidatePath('/app/alertes');
  redirect(result.ok ? '/app/alertes' : `/app/alertes?erreur=${result.error}`);
}

export async function deleteAlertAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/alertes');
  const repo = getRepo();
  const id = String(formData.get('id') ?? '');
  const alert = await repo.getRecord<AlertData>(profile.id, id);
  if (alert?.kind === ALERT_KIND) await repo.deleteRecord(profile.id, id);
  revalidatePath('/app/alertes');
  redirect('/app/alertes?ok=supprimee');
}
