'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { REFERRAL_COOKIE } from '@/lib/auth/constants';
import { requireOnboardedViewer, requireViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { isNicheId, type NicheId } from '@/lib/niches';
import { onOnboardingCompleted } from '@/lib/onboarding';
import { isFollowerRange, isVideoStyle } from '@/lib/profile-rules';
import { applyReferralCode, normalizeCode } from '@/lib/referral';
import { createScripts, StudioError } from '@/lib/studio';

function back(step: number, error: string): never {
  redirect(`/bienvenue?etape=${step}&erreur=${error}`);
}

/** Les 3 écrans de profil. Le dernier termine l'onboarding et ouvre les produits du jour. */
export async function saveOnboardingStep(formData: FormData) {
  const viewer = await requireViewer('/bienvenue');
  const repo = getRepo();
  const step = Number(formData.get('etape'));
  const userId = viewer.user.id;

  if (step === 1) {
    const firstName = String(formData.get('prenom') ?? '').trim().slice(0, 60);
    const handle = String(formData.get('pseudo') ?? '')
      .trim()
      .replace(/^@+/, '')
      .slice(0, 40);
    const range = formData.get('abonnes');
    if (!firstName) back(1, 'prenom');
    if (handle && !/^[A-Za-z0-9._]{2,24}$/.test(handle)) back(1, 'pseudo');
    if (!isFollowerRange(range)) back(1, 'abonnes');
    await repo.updateProfile(userId, { first_name: firstName, tiktok_handle: handle || null, follower_range: range });
    redirect('/bienvenue?etape=2');
  }

  if (step === 2) {
    const niches = formData.getAll('niches').filter(isNicheId) as NicheId[];
    const unique = [...new Set(niches)];
    if (unique.length === 0) back(2, 'niches-vide');
    if (unique.length > 3) back(2, 'niches-trop');
    await repo.updateProfile(userId, { niches: unique });
    redirect('/bienvenue?etape=3');
  }

  if (step === 3) {
    const style = formData.get('style');
    const phrase = String(formData.get('phrase') ?? '').trim().slice(0, 240);
    const code = normalizeCode(String(formData.get('code') ?? ''));
    if (!isVideoStyle(style)) back(3, 'style');

    if (code) {
      const profile = await repo.getProfile(userId);
      if (profile && !profile.coach_id && !profile.referred_by) {
        const result = await applyReferralCode(profile, code);
        if (result.kind === 'none' && result.reason === 'inconnu') back(3, 'code');
      }
    }
    cookies().delete(REFERRAL_COOKIE);

    await repo.updateProfile(userId, {
      video_style: style,
      example_phrase: phrase || null,
      onboarded_at: new Date().toISOString(),
    });
    await onOnboardingCompleted(userId);
    redirect('/bienvenue/produits');
  }

  redirect('/bienvenue');
}

/** Premier script, sur un des 3 produits du jour (compte dans le quota du jour, comme au studio). */
export async function writeFirstScriptAction(formData: FormData) {
  const { profile } = await requireOnboardedViewer('/bienvenue/produits');
  const productId = String(formData.get('produit') ?? '');
  let id: string;
  try {
    id = (await createScripts(profile, productId, 'demo')).id;
  } catch (error) {
    const code = error instanceof StudioError ? error.code : 'generation';
    if (!(error instanceof StudioError)) console.error('[bienvenue] script', error);
    redirect(`/bienvenue/produits?erreur=${code}`);
  }
  redirect(`/bienvenue/script/${id}`);
}
