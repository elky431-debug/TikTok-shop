'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { setStudentConsent } from '@/lib/coach';

/** Enregistre les deux accords de l'élève (détail de sa progression, e-mail), révocables à tout moment. */
export async function saveConsentAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/app/consentement-formateur');
  if (!profile.coach_id) redirect('/app/consentement-formateur');
  await setStudentConsent(profile, { detail: formData.get('detail') === '1', email: formData.get('email') === '1' });
  revalidatePath('/app/consentement-formateur');
  revalidatePath('/app/compte');
  redirect('/app/consentement-formateur?ok=1');
}
