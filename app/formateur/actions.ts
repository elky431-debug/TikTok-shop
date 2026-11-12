'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCoach } from '@/lib/auth/session';
import { publishAnnouncement } from '@/lib/coach';
import { addCoachCode, setCoachCodeActive } from '@/lib/referral';

export async function addCodeAction(formData: FormData) {
  const { coach } = await requireCoach();
  const result = await addCoachCode(coach, String(formData.get('code') ?? ''), String(formData.get('libelle') ?? ''));
  revalidatePath('/formateur');
  redirect(result.ok ? `/formateur?ok=code&code=${encodeURIComponent(result.code)}#codes` : `/formateur?erreur=code-${result.error}#codes`);
}

export async function toggleCodeAction(formData: FormData) {
  const { coach } = await requireCoach();
  const active = formData.get('actif') === '1';
  await setCoachCodeActive(coach, String(formData.get('fiche') ?? ''), active);
  revalidatePath('/formateur');
  redirect(`/formateur?ok=${active ? 'code-actif' : 'code-pause'}#codes`);
}

export async function announceAction(formData: FormData) {
  const { coach } = await requireCoach();
  const result = await publishAnnouncement(coach, { title: String(formData.get('titre') ?? ''), body: String(formData.get('message') ?? '') });
  revalidatePath('/formateur');
  redirect(result.ok ? `/formateur?ok=annonce&n=${result.recipients}#annonces` : `/formateur?erreur=annonce-${result.error}#annonces`);
}
