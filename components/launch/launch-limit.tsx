import Link from 'next/link';
import { Callout } from '@/components/ui/surface';
import { getPlan } from '@/lib/plans';
import type { PlanId } from '@/lib/db/types';

/** Message quand un lancement n'a pas pu s'ouvrir : limite de produits suivis du plan atteinte. */
export function LaunchLimitNotice({ reason, plan, className }: { reason: string | undefined; plan: PlanId; className?: string }) {
  if (reason !== 'limite') return null;
  const p = getPlan(plan);
  return (
    <Callout tone="warn" className={className} title={`Tu suis déjà ${p.savedProducts} produits, la limite du plan ${p.name}.`}>
      Termine ou abandonne un lancement dans{' '}
      <Link href="/app/lancer" className="font-semibold text-fg underline underline-offset-2">
        Lancer un produit
      </Link>{' '}
      pour en ouvrir un autre.
    </Callout>
  );
}
