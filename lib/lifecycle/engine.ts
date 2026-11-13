import type { Profile, Subscription } from '@/lib/db/types';
import { daysBetween, parisDate } from '@/lib/utils';
import { LIFECYCLE_INFO, type LifecycleType } from './types';

/**
 * Quels e-mails de cycle de vie sont dus pour un compte, ce jour-là. Pur et testable : la tâche nocturne fournit le
 * contexte, puis écarte ce qui a déjà été envoyé (même clé) ou coupé par l'utilisateur.
 *
 * Fenêtres volontairement courtes : au déploiement, les comptes anciens ne reçoivent pas un « bienvenue » tardif.
 * - bienvenue        : jour d'inscription (envoyé tout de suite à la fin de l'onboarding ; la nuit rattrape un échec) ;
 * - astuce_j1        : 1 à 3 jours après l'inscription ;
 * - rappel_j3        : 3 à 6 jours après, et seulement si aucun script n'a été écrit ;
 * - reactivation     : 14 à 45 jours sans ouvrir l'appli (une fois par absence) ;
 * - fin_essai        : essai Pro offert par un formateur qui finit dans 3 jours ou moins (une fois par essai) ;
 * - relance_paiement : abonnement « en retard de paiement » depuis 3 jours ou plus (une fois par incident), en plus de
 *                      l'e-mail envoyé par le webhook à chaque essai refusé, qui reste le seul e-mail le jour de l'échec.
 */
export interface LifecycleContext {
  profile: Pick<Profile, 'onboarded_at' | 'last_seen_at' | 'coach_id'>;
  /** Scripts déjà écrits ; null = pas compté (inutile hors de la fenêtre du rappel). */
  scripts: number | null;
  subscription: Pick<Subscription, 'id' | 'status' | 'trial_end'> | null;
  /** Premier jour (AAAA-MM-JJ) où l'abonnement a été vu « past_due », tel que gardé par la tâche nocturne. */
  pastDueSince: string | null;
  now: Date;
}

export interface DueEmail {
  type: LifecycleType;
  /** Clé d'envoi unique : un e-mail ne repart jamais pour la même clé. */
  key: string;
}

/** Jours depuis l'inscription (heure de Paris), null avant la fin de l'onboarding. */
export function daysSinceOnboarding(ctx: Pick<LifecycleContext, 'profile' | 'now'>): number | null {
  return ctx.profile.onboarded_at ? daysBetween(parisDate(new Date(ctx.profile.onboarded_at)), parisDate(ctx.now)) : null;
}

/** Faut-il compter les scripts ? (évite une requête par compte et par nuit) */
export function needsScriptCount(ctx: Pick<LifecycleContext, 'profile' | 'now'>): boolean {
  const age = daysSinceOnboarding(ctx);
  return age !== null && age >= 3 && age <= 6;
}

export function dueLifecycleEmails(ctx: LifecycleContext): DueEmail[] {
  const age = daysSinceOnboarding(ctx);
  if (age === null) return [];
  const today = parisDate(ctx.now);
  const due: DueEmail[] = [];

  if (age <= 2) due.push({ type: 'bienvenue', key: 'bienvenue' });
  if (age >= 3 && age <= 6 && ctx.scripts === 0) due.push({ type: 'rappel_j3', key: 'rappel_j3' });
  if (age >= 1 && age <= 3) due.push({ type: 'astuce_j1', key: 'astuce_j1' });
  const lastActive = ctx.profile.last_seen_at ?? ctx.profile.onboarded_at!;
  const away = daysBetween(parisDate(new Date(lastActive)), today);
  if (age >= 14 && away >= 14 && away <= 45) due.push({ type: 'reactivation', key: `reactivation:${parisDate(new Date(lastActive))}` });

  const sub = ctx.subscription;
  if (sub?.status === 'trialing' && ctx.profile.coach_id && sub.trial_end) {
    const left = new Date(sub.trial_end).getTime() - ctx.now.getTime();
    if (left > 0 && left <= 3 * 86_400_000) due.push({ type: 'fin_essai', key: `fin_essai:${sub.id}` });
  }
  if (sub?.status === 'past_due' && ctx.pastDueSince && daysBetween(ctx.pastDueSince, today) >= 3) {
    due.push({ type: 'relance_paiement', key: `relance_paiement:${sub.id}:${ctx.pastDueSince}` });
  }
  return due;
}

/**
 * Au plus un e-mail de conseils par nuit (le premier dû dans l'ordre ci-dessus), plus ceux sur l'abonnement : jamais
 * une rafale le même jour, ce qui reste dû part les nuits suivantes tant que sa fenêtre est ouverte.
 */
export function pickTonight(due: DueEmail[]): DueEmail[] {
  const advice = due.find((d) => LIFECYCLE_INFO[d.type].group === 'conseils');
  return [...(advice ? [advice] : []), ...due.filter((d) => LIFECYCLE_INFO[d.type].group === 'abonnement')];
}
