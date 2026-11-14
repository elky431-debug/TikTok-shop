'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { useRef, useState } from 'react';
import { buttonClasses, LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { WITHDRAWAL_CONSENT_FIELD, WITHDRAWAL_CONSENT_TEXT } from '@/lib/billing/consent';
import type { BillingInterval, PlanId } from '@/lib/db/types';
import { cn } from '@/lib/utils';

export interface PlanCard {
  id: PlanId;
  name: string;
  tagline: string;
  /** « Tout le Starter, plus : » au-dessus de la liste. */
  intro?: string;
  recommended?: boolean;
  monthly: string;
  yearly: string;
  yearlyMonthly: string;
  yearlySavings: string;
  /** Premier mois avec le code formateur (−20 %), ou null. */
  firstMonth?: string | null;
  features: Array<{ text: string; included: boolean }>;
}

const RANK: Record<PlanId, number> = { aucun: 0, starter: 1, pro: 2, elite: 3 };

/**
 * Cartes de prix avec bascule mensuel / annuel.
 * - mode « public » : boutons vers l'inscription ;
 * - mode « app » : formulaires qui lancent le paiement (action serveur), après la case de démarrage immédiat
 *   (délai de rétractation de 14 jours), obligatoire et revérifiée côté serveur.
 */
export function PricingCards({
  plans,
  mode,
  currentPlan,
  action,
  defaultInterval = 'month',
  yearlyBadge,
}: {
  plans: PlanCard[];
  mode: 'public' | 'app';
  currentPlan?: PlanId;
  action?: (formData: FormData) => void | Promise<void>;
  defaultInterval?: BillingInterval;
  /** Économie de l'annuel, affichée sur la bascule (« 4 mois offerts »). */
  yearlyBadge?: string;
}) {
  const [interval, setInterval] = useState<BillingInterval>(defaultInterval);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const consentRef = useRef<HTMLInputElement>(null);
  const subscribed = currentPlan && currentPlan !== 'aucun';

  return (
    <div>
      <div className="mb-10 flex justify-center">
        <div role="radiogroup" aria-label="Période de facturation" className="inline-flex rounded-xl border border-line bg-surface p-1">
          {(
            [
              ['month', 'Mensuel'],
              ['year', 'Annuel'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={interval === value}
              onClick={() => setInterval(value)}
              className={cn(
                'h-9 rounded-lg px-5 text-sm font-semibold transition-colors',
                interval === value ? 'bg-fg text-bg' : 'text-muted hover:text-fg',
              )}
            >
              {label}
              {value === 'year' && yearlyBadge ? (
                <span className={cn('ml-1.5', interval === value ? 'text-bg/70' : 'text-positive')}>{yearlyBadge}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {mode === 'app' ? (
        <div className="mx-auto mb-8 max-w-3xl">
          <label
            className={cn(
              'flex cursor-pointer gap-3 rounded-2xl border bg-raised p-4 text-sm leading-relaxed text-fg',
              consentError && !consent ? 'border-rose' : 'border-line',
            )}
          >
            <input
              ref={consentRef}
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (e.target.checked) setConsentError(false);
              }}
              aria-describedby="demarrage-aide"
              aria-invalid={consentError && !consent ? true : undefined}
              className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--rose-fill))]"
            />
            <span>{WITHDRAWAL_CONSENT_TEXT}</span>
          </label>
          <p id="demarrage-aide" className={cn('mt-2 text-xs', consentError && !consent ? 'font-semibold text-rose-ink' : 'text-muted')} role={consentError && !consent ? 'alert' : undefined}>
            {consentError && !consent
              ? 'Coche cette case pour démarrer ton abonnement tout de suite.'
              : 'Obligatoire pour démarrer tout de suite. '}
            {consentError && !consent ? ' ' : null}
            <Link href="/cgv#retractation" className="font-semibold text-fg underline decoration-fg/30 underline-offset-2 hover:decoration-fg">
              Ton droit de rétractation
            </Link>
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const highlighted = Boolean(plan.recommended);
          const current = currentPlan === plan.id;
          const verb = !subscribed ? 'Choisir' : RANK[plan.id] > RANK[currentPlan ?? 'aucun'] ? 'Passer à' : 'Revenir à';
          return (
            <div
              key={plan.id}
              className={cn(
                'relative flex flex-col rounded-2xl p-6',
                highlighted
                  ? 'gradient-border bg-raised bg-[radial-gradient(ellipse_at_top,_rgb(var(--rose)/0.12),_transparent_60%)] shadow-[var(--glow-pink)]'
                  : 'border border-line bg-raised',
              )}
            >
              {highlighted ? (
                <span className="absolute -top-3 right-4 rounded-full border border-rose/40 bg-rose-soft px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-ink">
                  Recommandé
                </span>
              ) : null}
              <h3 className="text-lg font-semibold text-fg">{plan.name}</h3>
              <p className="mt-1 text-xs text-muted">{plan.tagline}</p>
              <div className="mt-5 min-h-[5.25rem]">
                {interval === 'month' ? (
                  <>
                    <p className="num flex items-baseline gap-1.5 text-3xl font-bold text-fg">
                      {plan.monthly} <span className="text-sm font-medium text-muted">/ mois</span>
                    </p>
                    {plan.firstMonth ? (
                      <p className="num mt-1 text-xs text-muted">
                        <span className="font-semibold text-positive">{plan.firstMonth} le premier mois</span> avec ton code formateur
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="num flex items-baseline gap-1.5 text-3xl font-bold text-fg">
                      {plan.yearly} <span className="text-sm font-medium text-muted">/ an</span>
                    </p>
                    <p className="num mt-1 text-sm font-semibold text-fg">soit {plan.yearlyMonthly} / mois</p>
                    <p className="num mt-0.5 text-xs text-muted">
                      <span className="font-semibold text-positive">{plan.yearlySavings} économisés</span> par rapport au mensuel
                    </p>
                  </>
                )}
              </div>

              {plan.intro ? <p className="mt-5 text-sm font-semibold text-fg">{plan.intro}</p> : null}
              <ul className={cn('flex-1 space-y-2.5 text-sm text-fg/85', plan.intro ? 'mt-3' : 'mt-5')}>
                {plan.features.map((f) => (
                  <li key={f.text} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-ink" aria-hidden="true" />
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {mode === 'public' ? (
                  <LinkButton
                    href={`/connexion?plan=${plan.id}`}
                    variant={highlighted ? 'primary' : 'outline'}
                    size="lg"
                    className="w-full"
                  >
                    Choisir {plan.name}
                  </LinkButton>
                ) : current ? (
                  <p className={buttonClasses('outline', 'lg', 'pointer-events-none w-full')}>Ton plan actuel</p>
                ) : (
                  <form
                    action={action}
                    onSubmit={(e) => {
                      if (consent) return;
                      e.preventDefault();
                      setConsentError(true);
                      consentRef.current?.focus();
                    }}
                  >
                    <input type="hidden" name="plan" value={plan.id} />
                    <input type="hidden" name="periode" value={interval} />
                    <input type="hidden" name={WITHDRAWAL_CONSENT_FIELD} value={consent ? 'oui' : ''} />
                    <SubmitButton variant={highlighted ? 'primary' : 'ink'} size="lg" className="w-full" pendingLabel="Ouverture du paiement…">
                      {verb} {plan.name}
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
