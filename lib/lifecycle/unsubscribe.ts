import { getRepo, type Repo } from '@/lib/db';
import { saveRecapSettings } from '@/lib/digest/settings';
import type { UnsubscribeList } from '@/lib/unsubscribe';
import { disableLifecycle } from './preferences';
import { typesOfGroup } from './types';

/** Ce que coupe chaque lien de désinscription (texte de la page et de la confirmation). */
export const UNSUBSCRIBE_COPY: Record<UnsubscribeList, { title: string; button: string; done: string; where: string; whereHref: string }> = {
  matin: {
    title: 'Récap du matin par e-mail',
    button: 'Ne plus recevoir le récap',
    done: 'C’est fait : tu ne recevras plus le récap du matin par e-mail',
    where: 'la page Récap',
    whereHref: '/app/recap',
  },
  dimanche: {
    title: 'Récap du dimanche par e-mail',
    button: 'Ne plus recevoir le récap du dimanche',
    done: 'C’est fait : tu ne recevras plus le récap du dimanche par e-mail',
    where: 'la page Récap',
    whereHref: '/app/recap#dimanche',
  },
  conseils: {
    title: 'Conseils et nouvelles par e-mail',
    button: 'Ne plus recevoir les conseils',
    done: 'C’est fait : tu ne recevras plus les e-mails de conseils (bienvenue, astuce, rappel, nouvelles)',
    where: 'ton compte',
    whereHref: '/app/compte#emails',
  },
  abonnement: {
    title: 'E-mails sur ton abonnement',
    button: 'Ne plus recevoir ces rappels',
    done: 'C’est fait : tu ne recevras plus les rappels de fin d’essai et de paiement',
    where: 'ton compte',
    whereHref: '/app/compte#emails',
  },
};

/** Applique une désinscription (lien vérifié au préalable). Sans effet si le compte n'existe plus. */
export async function applyUnsubscribe(userId: string, list: UnsubscribeList, repo: Repo = getRepo()): Promise<boolean> {
  const profile = await repo.getProfile(userId);
  if (!profile) return false;
  if (list === 'matin') await repo.updateProfile(userId, { digest_email: false });
  else if (list === 'dimanche') await saveRecapSettings(profile, { dimanche: { email: false } }, repo);
  else await disableLifecycle(userId, typesOfGroup(list), repo);
  return true;
}
