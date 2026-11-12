'use client';

import { Check, Minus } from 'lucide-react';
import { useState } from 'react';
import { buttonClasses, LinkButton } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import type { BillingInterval, PlanId } from '@/lib/db/types';
import { cn } from '@/lib/utils';

export interface PlanCard {
  id: PlanId;
  name: string;
  tagline: string;
  monthly: string;
  yearly: string;
  yearlyMonthly: string;
  yearlySavings: string;
  features: Array<{ text: string; included: boolean }>;
}

/**
 * Cartes de prix avec bascule mensuel / annuel.
 * - mode « public » : boutons vers l'inscription ;
 * - mode « app » : formulaires qui lancent le paiement (action serveur).
 */
export function PricingCards({
  plans,
  mode,
  currentPlan,
  action,
  defaultInterval = 'month',
}: {
  plans: PlanCard[];
  mode: 'public' | 'app';
  currentPlan?: PlanId;
  action?: (formData: FormData) => void | Promise<void>;
  defaultInterval?: BillingInterval;
}) {
  const [interval, setInterval] = useState<BillingInterval>(defaultInterval);

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
              {value === 'year' ? (
                <span className={cn('ml-1.5', interval === value ? 'text-bg/60' : 'text-gain')}>−30&nbsp;%</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const highlighted = plan.id === 'pro';
          const current = currentPlan === plan.id;
          return (
            <div
              key={plan.id}
              className={cn(
                'relative flex flex-col rounded-2xl p-6',
                highlighted
                  ? 'gradient-border bg-raised bg-[radial-gradient(ellipse_at_top,_rgba(254,44,85,0.12),_transparent_60%)] shadow-[var(--glow-pink)]'
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
              <div className="mt-5 min-h-[4.25rem]">
                {plan.id === 'free' ? (
                  <p className="num text-3xl font-bold text-fg">0&nbsp;€</p>
                ) : interval === 'month' ? (
                  <p className="num flex items-baseline gap-1.5 text-3xl font-bold text-fg">
                    {plan.monthly}{' '}
                    <span className="text-sm font-medium text-muted">/ mois</span>
                  </p>
                ) : (
                  <>
                    <p className="num flex items-baseline gap-1.5 text-3xl font-bold text-fg">
                      {plan.yearly}{' '}
                      <span className="text-sm font-medium text-muted">/ an</span>
                    </p>
                    <p className="num mt-1 text-xs text-muted">
                      soit {plan.yearlyMonthly} par mois ·{' '}
                      <span className="font-semibold text-gain">{plan.yearlySavings} économisés</span>
                    </p>
                  </>
                )}
              </div>

              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-fg/85">
                {plan.features.map((f) => (
                  <li key={f.text} className={cn('flex gap-2.5', !f.included && 'text-muted')}>
                    {f.included ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-ink" aria-hidden="true" />
                    ) : (
                      <Minus className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                    )}
                    <span>
                      {f.included ? null : <span className="sr-only">Non inclus : </span>}
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {mode === 'public' ? (
                  <LinkButton
                    href="/connexion"
                    variant={highlighted ? 'primary' : 'outline'}
                    size="lg"
                    className="w-full"
                  >
                    {plan.id === 'free' ? 'Commencer gratuitement' : `Essayer ${plan.name}`}
                  </LinkButton>
                ) : plan.id === 'free' ? (
                  <p className={buttonClasses('secondary', 'lg', 'pointer-events-none w-full text-muted')}>
                    {current ? 'Ton plan actuel' : 'Inclus'}
                  </p>
                ) : current ? (
                  <p className={buttonClasses('outline', 'lg', 'pointer-events-none w-full')}>Ton plan actuel</p>
                ) : (
                  <form action={action}>
                    <input type="hidden" name="plan" value={plan.id} />
                    <input type="hidden" name="periode" value={interval} />
                    <SubmitButton variant={highlighted ? 'primary' : 'ink'} size="lg" className="w-full" pendingLabel="Ouverture du paiement…">
                      Passer {plan.name}
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
