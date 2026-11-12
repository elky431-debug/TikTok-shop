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
      <div className="mb-8 flex justify-center">
        <div role="radiogroup" aria-label="Période de facturation" className="inline-flex rounded-full bg-surface p-1">
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
                'h-10 rounded-full px-5 text-sm font-semibold transition-colors',
                interval === value ? 'bg-bg text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {label}
              {value === 'year' ? <span className="ml-1.5 text-gain">−30&nbsp;%</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {plans.map((plan) => {
          const highlighted = plan.id === 'pro';
          const current = currentPlan === plan.id;
          return (
            <div
              key={plan.id}
              className={cn(
                'flex flex-col rounded-2xl p-5 sm:p-6',
                highlighted ? 'border-2 border-fg bg-raised lg:-mt-3 lg:pb-9' : 'border border-line bg-raised',
                plan.id === 'free' && 'bg-surface border-transparent',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl">{plan.name}</h3>
                {highlighted ? <span className="rounded-full bg-fg px-2.5 py-0.5 text-xs font-semibold text-bg">Recommandé</span> : null}
              </div>
              <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
              <div className="mt-5 min-h-[4.5rem]">
                {plan.id === 'free' ? (
                  <p className="num text-4xl font-bold">0&nbsp;€</p>
                ) : interval === 'month' ? (
                  <p className="num text-4xl font-bold">
                    {plan.monthly}
                    <span className="text-base font-medium text-muted"> / mois</span>
                  </p>
                ) : (
                  <>
                    <p className="num text-4xl font-bold">
                      {plan.yearly}
                      <span className="text-base font-medium text-muted"> / an</span>
                    </p>
                    <p className="num mt-1 text-sm text-muted">
                      soit {plan.yearlyMonthly} par mois · <span className="font-semibold text-gain">{plan.yearlySavings} économisés</span>
                    </p>
                  </>
                )}
              </div>

              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {plan.features.map((f) => (
                  <li key={f.text} className={cn('flex gap-2.5', !f.included && 'text-muted')}>
                    {f.included ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-gain" aria-hidden="true" />
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
